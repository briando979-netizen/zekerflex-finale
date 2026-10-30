import { env } from "@/lib/env";
import { readForm, signatureValid, xmlResponse } from "@/lib/telephony/webhook";
import { twiml, sayAndGather } from "@/lib/telephony/twiml";
import { getCall, createCall, addTurn } from "@/lib/telephony/store";
import { scriptOrDefault } from "@/lib/telephony/scripts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/telephony/voice — Twilio haalt hier de TwiML op zodra een gesprek
// verbindt. Werkt voor uitgaande oproepen (callId in de query) én voor inkomende
// (geen callId → nieuw record, 24/7 beantwoorden). Twilio-handtekening vereist.
export async function POST(request: Request): Promise<Response> {
  const params = readForm(await request.text());
  if (!signatureValid(request, params)) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  let callId = url.searchParams.get("callId");
  let scriptKey = "inbound";

  if (callId) {
    const rec = await getCall(callId);
    if (rec) scriptKey = rec.script;
    else callId = null;
  }
  if (!callId) {
    const rec = await createCall({
      direction: "inbound",
      toNumber: params.To ?? env.TWILIO_FROM_NUMBER ?? "",
      fromNumber: params.From ?? "onbekend",
      status: "in-progress",
      script: "inbound",
      providerCallId: params.CallSid,
    });
    callId = rec.id;
    scriptKey = "inbound";
  }

  const script = scriptOrDefault(scriptKey);
  await addTurn(callId, "ai", script.opening).catch(() => undefined);
  const action = `${env.APP_BASE_URL.replace(/\/+$/, "")}/api/telephony/gather?callId=${callId}`;
  return xmlResponse(twiml(sayAndGather(script.opening, action)));
}
