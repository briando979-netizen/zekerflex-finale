import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { enforceRateLimit } from "@/lib/rate-limit";
import { antwoordOpSpoed } from "@/lib/spoed/oproep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const escapeXml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c);

// POST /api/telephony/sms — een inkomende sms op het Twilio-nummer: het
// antwoord van een kracht op een spoedoproep ("1", "2" of STOP; lib/spoed).
// Handtekening vereist. Onbekende nummers krijgen geen antwoord.
export async function POST(request: Request): Promise<Response> {
  const params = readForm(await request.text());
  if (!signatureValid(request, params)) return new Response("Forbidden", { status: 403 });
  const van = params.From ?? "";
  const tekst = params.Body ?? "";
  if (!van || !tekst) return xmlResponse("<Response/>");
  try {
    await enforceRateLimit({ name: "sms-inkomend", identifier: van, limit: 20, windowSeconds: 600, message: "te veel berichten" });
  } catch {
    return xmlResponse("<Response/>");
  }
  const antwoord = await antwoordOpSpoed(van, tekst, "sms").catch(() => null);
  return xmlResponse(antwoord ? `<Response><Message>${escapeXml(antwoord)}</Message></Response>` : "<Response/>");
}
