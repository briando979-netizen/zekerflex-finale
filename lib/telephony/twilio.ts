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
  /** Opnemen (standaard ja: de belscripts melden het). Niet bij het overgaan van een eigen medewerker (wachtrij). */
  opnemen?: boolean | undefined;
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
    // Bewust geen MachineDetection: die houdt het gesprek vast tot de analyse klaar
    // is, dus iemand die opneemt hoort stilte en gaat "hallo?" roepen. Voicemail
    // herkennen we aan de tekst (lib/telephony/intents).
  });
  if (input.opnemen !== false) {
    body.append("Record", "true");
    body.append("RecordingStatusCallback", input.statusUrl);
  }
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
  const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
  if (!res.ok || !data.sid) throw new Error(twilioRefusal(res.status, data));
  return { sid: data.sid };
}

/** Twilio's most common refusals in plain Dutch, with what to do about it. Other codes keep Twilio's own text. */
const REFUSALS: Record<number, string> = {
  20003: "Twilio herkent de inloggegevens niet. Controleer TWILIO_ACCOUNT_SID en TWILIO_AUTH_TOKEN op de server.",
  21210: "Het nummer waarmee ZekerFlex belt hoort niet bij dit Twilio-account. Controleer TWILIO_FROM_NUMBER.",
  21211: "Dit telefoonnummer is ongeldig. Controleer het nummer dat je wilde bellen.",
  21212: "Het nummer waarmee ZekerFlex belt is ongeldig. Controleer TWILIO_FROM_NUMBER.",
  21215: "Twilio mag dit nummer niet bellen: dat land of soort nummer staat uit. Zet het aan in Twilio onder Voice → Settings → Geo permissions.",
  21219: "Dit Twilio-account is een proefaccount en mag alleen geverifieerde nummers bellen. Verifieer het nummer in Twilio of maak het account betaald.",
};

export function twilioRefusal(status: number, data: { message?: string; code?: number }): string {
  const known = data.code === undefined ? undefined : REFUSALS[data.code];
  return `Twilio weigerde de oproep (${data.code ? `code ${data.code}` : status}): ${known ?? data.message ?? "onbekende fout"}`;
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
