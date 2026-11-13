import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { twiml, hangupAfter } from "@/lib/telephony/twiml";
import { getCall } from "@/lib/telephony/store";
import { voiceForLang, type Lang } from "@/lib/telephony/scripts";
import { ERR_LINE, FALLBACK, VERVOLG_WACHT_MS, binnen, haalOp, spreekAntwoord, type Uitslag } from "@/lib/telephony/agent-antwoord";
import { logger } from "@/lib/logger";
import { webhookTekst, WEBHOOK_MAX } from "@/lib/http/webhook-lezen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/telephony/gather/vervolg — Twilio komt hier na "een ogenblik" (de <Redirect> uit gather): het antwoord
// van het taalmodel dat nog onderweg was. Komt het ook nu niet, dan de standaardzin en blijft het gesprek open.
export async function POST(request: Request): Promise<Response> {
  const lees = await webhookTekst(request, WEBHOOK_MAX.twilio);
  if (!lees.ok) return lees.response;
  const params = readForm(lees.tekst);
  if (!signatureValid(request, params)) return new Response("Forbidden", { status: 403 });

  const callId = new URL(request.url).searchParams.get("callId");
  const rec = callId ? await getCall(callId) : null;
  const lang: Lang = rec?.lang ?? "nl";
  if (!rec || !callId) return xmlResponse(twiml(hangupAfter(ERR_LINE[lang], voiceForLang(lang))));

  const antwoord = haalOp(callId);
  // niets klaargezet: de app is tussendoor herstart (uitrol); geen fout, het gesprek gaat gewoon door
  if (!antwoord) logger.info("phone agent: geen wachtend antwoord voor de vervolgaanvraag");
  const uit: Uitslag = antwoord ? await binnen(antwoord, VERVOLG_WACHT_MS) : { klaar: false };
  // het model zelf stopt eerder (ANTWOORD_MAX_MS); dit gebeurt alleen als het eerst in de rij stond
  if (antwoord && !uit.klaar) logger.warn("phone agent reply failed", { error: `geen antwoord binnen ${VERVOLG_WACHT_MS} ms na een ogenblik` });
  return spreekAntwoord(callId, (uit.klaar ? uit.tekst : null) ?? FALLBACK[lang], lang);
}
