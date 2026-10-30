import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Twilio-adapter (geen SDK). Plaatst uitgaande oproepen via de REST API en
// valideert de X-Twilio-Signature op de inkomende webhooks. Alles optioneel:
// zonder TWILIO_*-env is twilioConfigured() false en draait de beller in mock.
// ---------------------------------------------------------------------------

export function twilioConfigured(): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER);
}

export interface PlaceCallInput {
  to: string;
  /** Webhook die de TwiML voor dit gesprek levert. */
  voiceUrl: string;
  /** Status- + opname-callback. */
  statusUrl: string;
}

/** Plaatst een echte uitgaande oproep. Geeft de Twilio Call SID terug. */
export async function placeTwilioCall(input: PlaceCallInput): Promise<{ sid: string }> {
  const sid = env.TWILIO_ACCOUNT_SID!;
  const token = env.TWILIO_AUTH_TOKEN!;
  const body = new URLSearchParams({
    To: input.to,
    From: env.TWILIO_FROM_NUMBER!,
    Url: input.voiceUrl,
    Method: "POST",
    StatusCallback: input.statusUrl,
    StatusCallbackMethod: "POST",
    Record: "true",
    RecordingStatusCallback: input.statusUrl,
  });
  body.append("StatusCallbackEvent", "initiated");
  body.append("StatusCallbackEvent", "answered");
  body.append("StatusCallbackEvent", "completed");

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok || !data.sid) {
    throw new Error(`Twilio weigerde de oproep (${res.status}): ${data.message ?? "onbekende fout"}`);
  }
  return { sid: data.sid };
}

/**
 * Valideert de X-Twilio-Signature van een webhook. Twilio tekent de volledige
 * URL plus, bij een POST, elke parameter (op naam gesorteerd) als
 * base64(HMAC-SHA1(authToken, string)). Zonder authToken kan niet gevalideerd
 * worden → false (dan hoort de route niets te doen).
 */
export function validateTwilioSignature(url: string, params: Record<string, string>, signature: string | null): boolean {
  const token = env.TWILIO_AUTH_TOKEN;
  if (!token || !signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", token).update(Buffer.from(data, "utf-8")).digest("base64");
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    logger.warn("twilio signature compare failed");
    return false;
  }
}
