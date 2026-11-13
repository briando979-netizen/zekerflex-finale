import { handtekeningOngeldigTekst } from "@/lib/webhooks/handtekening";
import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { webhookTekst, WEBHOOK_MAX } from "@/lib/http/webhook-lezen";
import { twiml, hangupAfter } from "@/lib/telephony/twiml";
import { addTurn, getCall } from "@/lib/telephony/store";
import { voiceForLang } from "@/lib/telephony/scripts";
import { terugbelBedankt } from "@/lib/telephony/wachtrij";
import { nummerVoorLog, zonderNummers } from "@/lib/telephony/log-nummer";
import { alertOwnerLater } from "@/lib/ops/alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/telephony/terugbellen — het terugbelverzoek (geen medewerker vrij of buiten kantoortijd): wat de beller zei
// komt in het gesprek, de eigenaar krijgt een melding (het nummer staat bij het gesprek in Beheer → AI-beller; in de
// melding alleen "+31…78"), en het gesprek eindigt met een bedankje. Handtekening vereist.
export async function POST(request: Request): Promise<Response> {
  const lees = await webhookTekst(request, WEBHOOK_MAX.twilio);
  if (!lees.ok) return lees.response;
  const params = readForm(lees.tekst);
  if (!signatureValid(request, params)) return handtekeningOngeldigTekst();

  const callId = new URL(request.url).searchParams.get("callId") ?? "";
  const rec = callId ? await getCall(callId).catch(() => null) : null;
  if (!rec) return xmlResponse(twiml(hangupAfter("Er ging iets mis. Bel ons gerust opnieuw.")));
  const lang = rec.lang ?? "nl";
  const speech = (params.SpeechResult ?? "").trim();
  if (speech) await addTurn(callId, "beller", speech).catch(() => undefined);
  await addTurn(callId, "ai", "(terugbelverzoek)").catch(() => undefined);
  alertOwnerLater({
    key: `terugbellen:${callId}`,
    title: "Terugbelverzoek via de telefoon",
    detail: `Beller ${nummerVoorLog(rec.fromNumber)}${speech ? `: "${zonderNummers(speech).slice(0, 200)}"` : " (zonder bericht)"}. Het nummer staat bij het gesprek in Beheer, AI-beller.`,
    url: "/admin/beller",
  });
  return xmlResponse(twiml(terugbelBedankt(lang, voiceForLang(lang), Boolean(speech))));
}
