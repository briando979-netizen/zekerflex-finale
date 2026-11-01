import { after } from "next/server";
import { readForm, signatureValid } from "@/lib/telephony/webhook";
import { findCallByProviderId, patchCall, type CallStatus } from "@/lib/telephony/store";
import { captureCallOutcome } from "@/lib/telephony/outcome";

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
// Uitgaand zit ons id in de URL; inkomend komt via de status-callback van het
// Twilio-nummer en kennen we het gesprek alleen aan zijn CallSid.
export async function POST(request: Request): Promise<Response> {
  const params = readForm(await request.text());
  if (!signatureValid(request, params)) return new Response("Forbidden", { status: 403 });

  const callId =
    new URL(request.url).searchParams.get("callId") ??
    (params.CallSid ? (await findCallByProviderId(params.CallSid))?.id : undefined);
  if (!callId) return new Response(null, { status: 204 });

  const patch: { status?: CallStatus; recordingUrl?: string } = {};
  const st = mapStatus(params.CallStatus);
  if (st) patch.status = st;
  if (params.RecordingUrl) patch.recordingUrl = `${params.RecordingUrl}.mp3`;
  if (Object.keys(patch).length) await patchCall(callId, patch).catch(() => undefined);

  // Gesprek afgelopen → uitkomst (interesse/naam/terugbel) uit het transcript
  // halen en in de pijplijn zetten. Op de achtergrond zodat Twilio snel een
  // antwoord krijgt.
  if (st === "completed") after(() => captureCallOutcome(callId).catch(() => undefined));

  return new Response(null, { status: 204 });
}
