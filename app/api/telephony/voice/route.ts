import { env } from "@/lib/env";
import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { twiml, sayAndGather, gatherDigits } from "@/lib/telephony/twiml";
import { getCall, createCall, addTurn } from "@/lib/telephony/store";
import { scriptOrDefault, LANG_MENU } from "@/lib/telephony/scripts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/telephony/voice — Twilio haalt hier de TwiML op zodra een gesprek
// verbindt. Uitgaand (callId bekend = wij belden) → meteen het script + gesprek.
// Inkomend (geen callId) → nieuw record + tweetalige TAALKEUZE (IVR). Handtekening vereist.
export async function POST(request: Request): Promise<Response> {
  const params = readForm(await request.text());
  if (!signatureValid(request, params)) return new Response("Forbidden", { status: 403 });

  const base = env.APP_BASE_URL.replace(/\/+$/, "");
  const existingId = new URL(request.url).searchParams.get("callId");

  if (existingId) {
    const rec = await getCall(existingId);
    if (rec) {
      const script = scriptOrDefault(rec.script);
      await addTurn(existingId, "ai", script.opening).catch(() => undefined);
      return xmlResponse(twiml(sayAndGather(script.opening, `${base}/api/telephony/gather?callId=${existingId}`)));
    }
  }

  // Inkomend: record + taalkeuze → /menu?step=lang.
  const rec = await createCall({
    direction: "inbound",
    toNumber: params.To ?? env.TWILIO_FROM_NUMBER ?? "",
    fromNumber: params.From ?? "onbekend",
    status: "in-progress",
    script: "inbound",
    providerCallId: params.CallSid,
  });
  return xmlResponse(twiml(gatherDigits(LANG_MENU, `${base}/api/telephony/menu?callId=${rec.id}&step=lang`)));
}
