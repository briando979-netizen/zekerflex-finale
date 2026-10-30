import { env } from "@/lib/env";
import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { twiml, sayAndGather, hangupAfter } from "@/lib/telephony/twiml";
import { getCall, addTurn } from "@/lib/telephony/store";
import { PHONE_AGENT_SYSTEM } from "@/lib/telephony/scripts";
import { chat, fastModel, llmConfigProblem, ensureAiNode } from "@/lib/ai/client";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BYE = /\b(doei|daag|dag|tot ziens|bedankt|dank (?:je|u)|fijne dag|hang|ophangen|nee bedankt)\b/i;
const FALLBACK = "Dat kan ik het beste via de website regelen: kijk op zekerflex punt com, of mail naar info at zekerflex punt com. Kan ik u verder nog ergens mee helpen?";

// POST /api/telephony/gather — de gesprekslus. Twilio stuurt wat de beller zei
// (SpeechResult); de AI antwoordt kort en we luisteren opnieuw. Handtekening vereist.
export async function POST(request: Request): Promise<Response> {
  const params = readForm(await request.text());
  if (!signatureValid(request, params)) return new Response("Forbidden", { status: 403 });

  const callId = new URL(request.url).searchParams.get("callId");
  const rec = callId ? await getCall(callId) : null;
  if (!rec || !callId) {
    return xmlResponse(twiml(hangupAfter("Er ging iets mis. Bel ons gerust opnieuw. Tot ziens.")));
  }

  const speech = (params.SpeechResult ?? "").trim();
  if (speech) await addTurn(callId, "beller", speech).catch(() => undefined);

  if (speech && BYE.test(speech) && speech.length < 40) {
    await addTurn(callId, "ai", "Fijn dat u belde. Een prettige dag nog, en tot ziens.").catch(() => undefined);
    return xmlResponse(twiml(hangupAfter("Fijn dat u belde. Een prettige dag nog, en tot ziens.")));
  }

  let reply = FALLBACK;
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
        maxTokens: 130,
        messages: [{ role: "system", content: PHONE_AGENT_SYSTEM }, ...history],
      });
      const t = out.text.trim();
      if (t) reply = t;
    }
  } catch (err) {
    logger.warn("phone agent reply failed", { error: (err as Error).message });
  }

  await addTurn(callId, "ai", reply).catch(() => undefined);
  const action = `${env.APP_BASE_URL.replace(/\/+$/, "")}/api/telephony/gather?callId=${callId}`;
  return xmlResponse(twiml(sayAndGather(reply, action)));
}
