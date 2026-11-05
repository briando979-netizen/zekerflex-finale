import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { twilioConfigured, twilioRefusal } from "@/lib/telephony/twilio";
import type { Kanaal } from "@/lib/spoed/regels";

// ---------------------------------------------------------------------------
// De kanalen van een spoedoproep buiten de app: sms via Twilio (Messages API,
// zelfde account als de AI-beller) en WhatsApp via de eigen brug
// (deploy/whatsapp-brug, een los containertje met een eigen WhatsApp-nummer).
// Alles optioneel: zonder sleutels is het kanaal "niet ingericht" en blijft
// de push in de app over. Nooit een capability-URL of nummer in het log.
// ---------------------------------------------------------------------------

export function smsIngericht(): boolean {
  return twilioConfigured() || Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_SMS_FROM);
}

export function whatsappIngericht(): boolean {
  return Boolean(env.WHATSAPP_BRUG_URL && env.WHATSAPP_BRUG_TOKEN);
}

export function kanalenBeschikbaar(): Record<Kanaal, boolean> {
  return { push: true, sms: smsIngericht(), whatsapp: whatsappIngericht() };
}

/** Eén sms. Gooit bij een weigering van Twilio (in gewoon Nederlands). */
export async function stuurSms(naar: string, tekst: string): Promise<{ sid: string }> {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  const van = env.TWILIO_SMS_FROM || env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !van) throw new Error("Sms is niet ingericht (TWILIO_*).");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: naar, From: van, Body: tekst }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
  if (!res.ok || !data.sid) throw new Error(twilioRefusal(res.status, data));
  return { sid: data.sid };
}

/** Eén WhatsApp-bericht via de brug. */
export async function stuurWhatsApp(naar: string, tekst: string): Promise<void> {
  const url = env.WHATSAPP_BRUG_URL;
  const token = env.WHATSAPP_BRUG_TOKEN;
  if (!url || !token) throw new Error("WhatsApp is niet ingericht (WHATSAPP_BRUG_*).");
  const res = await fetch(`${url.replace(/\/+$/, "")}/stuur`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ naar, tekst }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const d = (await res.json().catch(() => ({}))) as { fout?: string };
    throw new Error(d.fout ?? `WhatsApp-brug antwoordde ${res.status}`);
  }
}

/** Is de brug er en gekoppeld aan een nummer? Voor Te doen en het paneel. */
export async function whatsappStand(): Promise<{ ingericht: boolean; verbonden: boolean; nummer?: string }> {
  if (!whatsappIngericht()) return { ingericht: false, verbonden: false };
  try {
    const res = await fetch(`${env.WHATSAPP_BRUG_URL!.replace(/\/+$/, "")}/gezond`, {
      headers: { Authorization: `Bearer ${env.WHATSAPP_BRUG_TOKEN!}` },
      signal: AbortSignal.timeout(4000),
    });
    const d = (await res.json().catch(() => ({}))) as { verbonden?: boolean; nummer?: string };
    return { ingericht: true, verbonden: Boolean(d.verbonden), ...(d.nummer ? { nummer: d.nummer } : {}) };
  } catch (err) {
    logger.warn("whatsapp-brug niet bereikbaar", { err: err instanceof Error ? err.message : String(err) });
    return { ingericht: true, verbonden: false };
  }
}
