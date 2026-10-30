import { readForm, signatureValid } from "@/lib/telephony/webhook";
import { patchCall, type CallStatus } from "@/lib/telephony/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KNOWN: CallStatus[] = ["queued", "ringing", "in-progress", "completed", "failed", "busy", "no-answer"];

function mapStatus(s: string | undefined): CallStatus | null {
  if (!s) return null;
  if (s === "initiated") return "queued";
  if (s === "canceled") return "failed";
  return (KNOWN as string[]).includes(s) ? (s as CallStatus) : null;
}

// POST /api/telephony/status — Twilio status- én opname-callback. Werkt het
// oproep-record bij (status, opname-URL). Geen TwiML nodig. Handtekening vereist.
export async function POST(request: Request): Promise<Response> {
  const params = readForm(await request.text());
  if (!signatureValid(request, params)) return new Response("Forbidden", { status: 403 });

  const callId = new URL(request.url).searchParams.get("callId");
  if (!callId) return new Response("", { status: 204 });

  const patch: { status?: CallStatus; recordingUrl?: string } = {};
  const st = mapStatus(params.CallStatus);
  if (st) patch.status = st;
  if (params.RecordingUrl) patch.recordingUrl = `${params.RecordingUrl}.mp3`;
  if (Object.keys(patch).length) await patchCall(callId, patch).catch(() => undefined);

  return new Response("", { status: 204 });
}
