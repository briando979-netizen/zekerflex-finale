import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { twilioConfigured, placeTwilioCall } from "@/lib/telephony/twilio";
import { isAllowedToCall } from "@/lib/telephony/consent";
import { createCall, addTurn, type CallRecord } from "@/lib/telephony/store";
import { scriptOrDefault } from "@/lib/telephony/scripts";

// ---------------------------------------------------------------------------
// Hoog niveau: consent → opslag → Twilio (of mock). Mock = veilig: legt de
// oproep + openingszin vast zonder echt te bellen (handig zonder Twilio-account
// of om scripts te testen).
// ---------------------------------------------------------------------------

export function callerConfigured(): boolean {
  return twilioConfigured();
}

export interface OutboundInput {
  to: string;
  script: string;
  leadId?: string | undefined;
  /** De beller is een bedrijf (B2B). Bepaalt of koud bellen mag (zie consent). */
  b2b?: boolean | undefined;
  /** Een mens (beheerder) startte de oproep zelf → alleen opt-out blokkeert. */
  humanInitiated?: boolean | undefined;
}

export interface OutboundResult {
  ok: boolean;
  reason: string;
  callId?: string;
  mock: boolean;
}

function base(): string {
  return env.APP_BASE_URL.replace(/\/+$/, "");
}

export async function placeOutboundCall(input: OutboundInput): Promise<OutboundResult> {
  const decision = await isAllowedToCall(input.to, {
    b2b: input.b2b ?? false,
    humanInitiated: input.humanInitiated ?? false,
  });
  if (!decision.allowed) {
    return { ok: false, reason: decision.reason, mock: !callerConfigured() };
  }

  const script = scriptOrDefault(input.script);
  const configured = callerConfigured();

  const rec: CallRecord = await createCall({
    direction: "outbound",
    toNumber: input.to,
    fromNumber: env.TWILIO_FROM_NUMBER ?? "mock",
    status: configured ? "queued" : "mock",
    script: input.script,
    leadId: input.leadId,
  });

  if (!configured) {
    // Mock: leg de openingszin vast zodat je het script ziet, maar bel niet.
    await addTurn(rec.id, "ai", script.opening);
    logger.info("telephony mock call (geen Twilio geconfigureerd)", { callId: rec.id, to: input.to });
    return { ok: true, reason: "mock — geen echte oproep (Twilio niet geconfigureerd)", callId: rec.id, mock: true };
  }

  try {
    const voiceUrl = `${base()}/api/telephony/voice?callId=${rec.id}`;
    const statusUrl = `${base()}/api/telephony/status?callId=${rec.id}`;
    const { sid } = await placeTwilioCall({ to: input.to, voiceUrl, statusUrl });
    const { patchCall } = await import("@/lib/telephony/store");
    await patchCall(rec.id, { providerCallId: sid });
    logger.info("telephony outbound call placed", { callId: rec.id, sid, to: input.to });
    return { ok: true, reason: decision.reason, callId: rec.id, mock: false };
  } catch (err) {
    const { patchCall } = await import("@/lib/telephony/store");
    await patchCall(rec.id, { status: "failed" });
    logger.warn("telephony outbound call failed", { callId: rec.id, error: (err as Error).message });
    return { ok: false, reason: (err as Error).message, callId: rec.id, mock: false };
  }
}
