import { env } from "@/lib/env";
import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { twiml, sayAndGather, hangupAfter, say, dial } from "@/lib/telephony/twiml";
import { getCall, addTurn, patchCall } from "@/lib/telephony/store";
import { phoneSystem, voiceForLang, recogLang, scriptOrDefault, voicemailMessage, type Lang } from "@/lib/telephony/scripts";
import { isGoodbye, isGreetingOnly, looksLikeVoicemail } from "@/lib/telephony/intents";
import { chat, fastModel, llmConfigProblem, ensureAiNode } from "@/lib/ai/client";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Ik wil een mens"-herkenning, NL + EN.
const FORWARD =
  /\b(de baas|\bbaas\b|briando|eigenaar|directeur|met iemand|iemand spreken|een mens|een medewerker|doorverbind|doorschakel|met een persoon|verantwoordelijke|the boss|a human|a person|someone|representative|an agent|manager)\b/i;

// Twilio wacht maar kort op een webhook: zonder eigen grens loopt een traag model
// (standaard 30s, met herhalingen) uit op een afgebroken gesprek.
const REPLY_TIMEOUT_MS = 8_000;

// Antwoord op alleen een begroeting. "Hallo?" betekent aan de telefoon meestal
// "is daar iemand?", dus eerst dat, buiten <Gather> zodat nog een "hallo" het niet afkapt.
const HEARD: Record<Lang, string> = {
  nl: "Ja, ik hoor u goed.",
  en: "Yes, I can hear you.",
};
const GREET_QUESTION: Record<Lang, string> = {
  nl: "Waar kan ik u mee helpen — zoekt u personeel, zoekt u zelf werk, of heeft u een andere vraag?",
  en: "How can I help — are you looking for staff, looking for work yourself, or do you have another question?",
};

const FALLBACK: Record<Lang, string> = {
  nl: "Dat kan ik het beste via de website regelen: kijk op zekerflex punt com, of mail naar info at zekerflex punt com. Kan ik u verder nog ergens mee helpen?",
  en: "I can best arrange that via the website: visit zekerflex dot com, or e-mail info at zekerflex dot com. Can I help you with anything else?",
};
const BYE_LINE: Record<Lang, string> = {
  nl: "Fijn dat u belde. Een prettige dag nog, en tot ziens.",
  en: "Thanks for calling. Have a great day, and goodbye.",
};
const ERR_LINE: Record<Lang, string> = {
  nl: "Er ging iets mis. Bel ons gerust opnieuw. Tot ziens.",
  en: "Something went wrong. Please feel free to call us again. Goodbye.",
};

// POST /api/telephony/gather — de gesprekslus in de gekozen taal. Twilio stuurt
// wat de beller zei (SpeechResult); de AI antwoordt kort en we luisteren opnieuw.
export async function POST(request: Request): Promise<Response> {
  const params = readForm(await request.text());
  if (!signatureValid(request, params)) return new Response("Forbidden", { status: 403 });

  const callId = new URL(request.url).searchParams.get("callId");
  const rec = callId ? await getCall(callId) : null;
  const lang: Lang = rec?.lang ?? "nl";
  const voice = voiceForLang(lang);
  if (!rec || !callId) {
    return xmlResponse(twiml(hangupAfter(ERR_LINE[lang], voice)));
  }
  const action = `${env.APP_BASE_URL.replace(/\/+$/, "")}/api/telephony/gather?callId=${callId}`;

  const speech = (params.SpeechResult ?? "").trim();
  const firstReply = !rec.transcript.some((t) => t.who === "beller");
  if (speech) await addTurn(callId, "beller", speech).catch(() => undefined);

  // Voicemail of bandje (alleen als wij belden): één bericht inspreken en ophangen.
  if (speech && rec.direction === "outbound" && looksLikeVoicemail(speech)) {
    const message = voicemailMessage(rec.script);
    await addTurn(callId, "ai", `(voicemail) ${message}`).catch(() => undefined);
    return xmlResponse(twiml(hangupAfter(message, voice)));
  }

  if (speech && isGoodbye(speech, firstReply)) {
    await addTurn(callId, "ai", BYE_LINE[lang]).catch(() => undefined);
    await patchCall(callId, { status: "completed" }).catch(() => undefined);
    // De uitkomst komt via de status-callback, ook als iemand zomaar ophangt.
    return xmlResponse(twiml(hangupAfter(BYE_LINE[lang], voice)));
  }

  // Alleen een begroeting gaat niet naar het taalmodel: dat spiegelt de begroeting
  // of komt leeg terug. Uitgaand herhalen we waarom we bellen.
  if (speech && isGreetingOnly(speech, firstReply)) {
    const question = rec.direction === "outbound" ? scriptOrDefault(rec.script).question : GREET_QUESTION[lang];
    await addTurn(callId, "ai", `${HEARD[lang]} ${question}`).catch(() => undefined);
    return xmlResponse(twiml(say(HEARD[lang], voice) + sayAndGather(question, action, { voice, recogLang: recogLang(lang) })));
  }

  if (speech && FORWARD.test(speech)) {
    const fwd = env.TELEPHONY_FORWARD_NUMBER;
    if (fwd) {
      const line = lang === "en" ? "I'll connect you, one moment please." : "Ik verbind u door, een moment alstublieft.";
      await addTurn(callId, "ai", `Doorverbinden → ${fwd}`).catch(() => undefined);
      return xmlResponse(twiml(say(line, voice) + dial(fwd)));
    }
    const back =
      lang === "en"
        ? "That person isn't directly available. I can arrange a call back — tell me your name and when you'd like to be called."
        : "Die persoon is nu niet direct bereikbaar. Ik kan een terugbelafspraak inplannen — zeg uw naam en wanneer u gebeld wilt worden.";
    await addTurn(callId, "ai", back).catch(() => undefined);
    return xmlResponse(twiml(sayAndGather(back, action, { voice, recogLang: recogLang(lang) })));
  }

  let reply = FALLBACK[lang];
  try {
    await ensureAiNode();
    if (!llmConfigProblem()) {
      const fresh = (await getCall(callId)) ?? rec;
      const history = fresh.transcript.slice(-10).map((t) => ({
        role: (t.who === "ai" ? "assistant" : "user") as "assistant" | "user",
        content: t.text,
      }));
      const out = await chat({
        purpose: "phone-agent",
        model: fastModel(),
        temperature: 0.3,
        maxTokens: 140,
        timeoutMs: REPLY_TIMEOUT_MS,
        retry: false,
        messages: [{ role: "system", content: phoneSystem(lang) }, ...history],
      });
      const t = out.text.trim();
      if (t) reply = t;
    }
  } catch (err) {
    logger.warn("phone agent reply failed", { error: (err as Error).message });
  }

  await addTurn(callId, "ai", reply).catch(() => undefined);
  return xmlResponse(twiml(sayAndGather(reply, action, { voice, recogLang: recogLang(lang) })));
}
