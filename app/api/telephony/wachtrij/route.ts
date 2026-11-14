import { handtekeningOngeldigTekst } from "@/lib/webhooks/handtekening";
import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { webhookTekst, WEBHOOK_MAX } from "@/lib/http/webhook-lezen";
import { after } from "next/server";
import { env } from "@/lib/env";
import { twiml } from "@/lib/telephony/twiml";
import { getCall, patchCall } from "@/lib/telephony/store";
import { voiceForLang } from "@/lib/telephony/scripts";
import { MAX_POGINGEN, MAX_WACHT_S, wachtTwiml } from "@/lib/telephony/wachtrij";
import { belMedewerker, medewerkerBezig } from "@/lib/telephony/wachtrij-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/telephony/wachtrij — wat de beller hoort terwijl hij wacht (de waitUrl van <Enqueue>). Twilio vraagt dit steeds
// opnieuw op, met QueuePosition en QueueTime. Staat hij vooraan en gaat de telefoon van de medewerker nog niet over, dan
// laten we die overgaan (op de achtergrond: Twilio krijgt meteen antwoord). Handtekening vereist.
export async function POST(request: Request): Promise<Response> {
  const lees = await webhookTekst(request, WEBHOOK_MAX.twilio);
  if (!lees.ok) return lees.response;
  const params = readForm(lees.tekst);
  if (!signatureValid(request, params)) return handtekeningOngeldigTekst();

  const callId = new URL(request.url).searchParams.get("callId") ?? "";
  const rec = callId ? await getCall(callId).catch(() => null) : null;
  const lang = rec?.lang ?? "nl";
  const positie = Number(params.QueuePosition ?? 1) || 1;
  const wachttijd = Number(params.QueueTime ?? 0) || 0;
  if (positie <= 1 && wachttijd < MAX_WACHT_S && rec && !(await medewerkerBezig())) {
    // al MAX_POGINGEN keer overgegaan zonder dat iemand aannam (geweigerd, voicemail, niet opgenomen): niet blijven
    // bellen maar uit de rij, dan geeft de action van <Enqueue> het terugbelaanbod (14 nov: anders ging de telefoon
    // van de medewerker in drie minuten tot zes keer over)
    const pogingen = rec.medewerkerPogingen ?? 0;
    if (pogingen >= MAX_POGINGEN) return xmlResponse(twiml("<Leave/>"));
    await patchCall(callId, { medewerkerPogingen: pogingen + 1 }).catch(() => undefined);
    const base = env.APP_BASE_URL.replace(/\/+$/, "");
    after(() => belMedewerker(base, callId).catch(() => undefined));
  }
  return xmlResponse(twiml(wachtTwiml({ lang, voice: voiceForLang(lang), positie, wachttijd })));
}
