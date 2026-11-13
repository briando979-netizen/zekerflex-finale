import { handtekeningOngeldigTekst } from "@/lib/webhooks/handtekening";
import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { webhookTekst, WEBHOOK_MAX } from "@/lib/http/webhook-lezen";
import { env } from "@/lib/env";
import { twiml } from "@/lib/telephony/twiml";
import { addTurn, getCall } from "@/lib/telephony/store";
import { aannemenTwiml, medewerkerTwiml } from "@/lib/telephony/wachtrij";
import { zetMedewerker } from "@/lib/telephony/wachtrij-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/telephony/wachtrij/medewerker — de oproep naar de medewerker (lib/telephony/wachtrij-server.ts).
//   zonder stap    : hij neemt op en hoort wie er wacht, met "toets 1"
//   stap=aannemen  : toets 1 = de beller die vooraan staat erbij (<Dial><Queue>), anders ophangen
//   stap=status    : de statuscallback van die oproep; afgelopen = de medewerker is weer vrij
// Handtekening vereist.
export async function POST(request: Request): Promise<Response> {
  const lees = await webhookTekst(request, WEBHOOK_MAX.twilio);
  if (!lees.ok) return lees.response;
  const params = readForm(lees.tekst);
  if (!signatureValid(request, params)) return handtekeningOngeldigTekst();

  const url = new URL(request.url);
  const callId = url.searchParams.get("callId") ?? "";
  const stap = url.searchParams.get("stap");

  if (stap === "status") {
    if (["completed", "busy", "failed", "no-answer", "canceled"].includes(params.CallStatus ?? "")) await zetMedewerker("vrij");
    return new Response(null, { status: 204 });
  }
  if (stap === "aannemen") {
    const aangenomen = (params.Digits ?? "").trim() === "1";
    if (aangenomen) {
      await zetMedewerker("bezet");
      if (callId) await addTurn(callId, "ai", "(een medewerker neemt het gesprek aan)").catch(() => undefined);
    }
    return xmlResponse(twiml(aannemenTwiml(aangenomen)));
  }
  const rec = callId ? await getCall(callId).catch(() => null) : null;
  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  return xmlResponse(twiml(medewerkerTwiml({ base, callId, dept: rec?.dept })));
}
