import { handtekeningOngeldigTekst } from "@/lib/webhooks/handtekening";
import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { webhookTekst, WEBHOOK_MAX } from "@/lib/http/webhook-lezen";
import { env } from "@/lib/env";
import { twiml } from "@/lib/telephony/twiml";
import { addTurn, getCall } from "@/lib/telephony/store";
import { voiceForLang } from "@/lib/telephony/scripts";
import { naWachtrijTwiml } from "@/lib/telephony/wachtrij";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/telephony/wachtrij/klaar — de action van <Enqueue>: hoe de wachtrij afliep (QueueResult). Verbonden of
// opgehangen: klaar. Te lang gewacht of een fout: het terugbelaanbod. Handtekening vereist.
export async function POST(request: Request): Promise<Response> {
  const lees = await webhookTekst(request, WEBHOOK_MAX.twilio);
  if (!lees.ok) return lees.response;
  const params = readForm(lees.tekst);
  if (!signatureValid(request, params)) return handtekeningOngeldigTekst();

  const callId = new URL(request.url).searchParams.get("callId") ?? "";
  const rec = callId ? await getCall(callId).catch(() => null) : null;
  const lang = rec?.lang ?? "nl";
  const uitslag = (params.QueueResult ?? "").trim();
  if (rec) await addTurn(callId, "ai", `(wachtrij: ${uitslag || "onbekend"})`).catch(() => undefined);
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  return xmlResponse(twiml(naWachtrijTwiml({ base, callId, lang, voice: voiceForLang(lang), uitslag })));
}
