import { env } from "@/lib/env";
import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { twiml, sayAndGather, hangupAfter, say, dial } from "@/lib/telephony/twiml";
import { getCall, addTurn } from "@/lib/telephony/store";
import { phoneSystem, voiceForLang, recogLang, type Lang } from "@/lib/telephony/scripts";
import { chat, fastModel, llmConfigProblem, ensureAiNode } from "@/lib/ai/client";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Einde-gesprek + "ik wil een mens" herkenning, NL + EN.
const BYE =
  /\b(doei|daag|dag|tot ziens|bedankt|dank (?:je|u)|fijne dag|hang|ophangen|nee bedankt|bye|goodbye|thanks|thank you|no thanks)\b/i;
const FORWARD =
  /\b(de baas|\bbaas\b|briando|eigenaar|directeur|met iemand|iemand spreken|een mens|een medewerker|doorverbind|doorschakel|met een persoon|verantwoordelijke|the boss|a human|a person|someone|representative|an agent|manager)\b/i;

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
  if (speech) await addTurn(callId, "beller", speech).catch(() => undefined);

  if (speech && BYE.test(speech) && speech.length < 40) {
    await addTurn(callId, "ai", BYE_LINE[lang]).catch(() => undefined);
    return xmlResponse(twiml(hangupAfter(BYE_LINE[lang], voice)));
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
