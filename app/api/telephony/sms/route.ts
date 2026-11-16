import { after } from "next/server";
import { handtekeningOngeldigTekst } from "@/lib/webhooks/handtekening";
import { normalizeNumber } from "@/lib/telephony/consent";
import { bewaarBericht, lijnBijNummer, meldBericht, opties } from "@/lib/telephony/lijn-server";
import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { enforceRateLimit } from "@/lib/rate-limit";
import { antwoordOpSpoed } from "@/lib/spoed/oproep";
import { webhookTekst, WEBHOOK_MAX } from "@/lib/http/webhook-lezen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c);

// POST /api/telephony/sms — een inkomende sms op het Twilio-nummer: het
// antwoord van een kracht op een spoedoproep ("1", "2" of STOP; lib/spoed).
// Handtekening vereist. Onbekende nummers krijgen geen antwoord.
export async function POST(request: Request): Promise<Response> {
  const lees = await webhookTekst(request, WEBHOOK_MAX.twilio);
  if (!lees.ok) return lees.response;
  const params = readForm(lees.tekst);
  if (!signatureValid(request, params)) return handtekeningOngeldigTekst();
  const van = params.From ?? "";
  const tekst = params.Body ?? "";
  if (!van || !tekst) return xmlResponse("<Response/>");
  try {
    await enforceRateLimit({ name: "sms-inkomend", identifier: van, limit: 20, windowSeconds: 600, message: "te veel berichten" });
  } catch {
    return xmlResponse("<Response/>");
  }
  // een sms naar een klantlijn (16 nov): bewaren bij die lijn en de klant een seintje geven; geen automatisch antwoord
  const lijn = await lijnBijNummer(params.To).catch(() => null);
  if (lijn) {
    if (opties(lijn).has("sms") && params.MessageSid) {
      const b = await bewaarBericht(lijn, params.MessageSid, { soort: "sms", van: normalizeNumber(van), tekst: tekst.slice(0, 1600) }).catch(() => null);
      if (b) after(() => meldBericht(lijn, b));
    }
    return xmlResponse("<Response/>");
  }
  const antwoord = await antwoordOpSpoed(van, tekst, "sms").catch(() => null);
  return xmlResponse(antwoord ? `<Response><Message>${escapeXml(antwoord)}</Message></Response>` : "<Response/>");
}
