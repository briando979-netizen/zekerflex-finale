import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { tekstBegrensd } from "@/lib/http/body-grens";

// De body van een webhook of inkomend kanaal (Stripe, Didit, Twilio sms/voice, de WhatsApp-brug) begrensd inlezen
// (12 nov 2026, beveiligingsronde). Te groot = 422, nooit 403 (CrowdSec). De handtekening wordt gecontroleerd op precies de
// tekst die hier terugkomt: de bytes worden maar één keer gelezen en onveranderd als UTF-8 doorgegeven.
// De grenzen zijn royaal: een echte Stripe-gebeurtenis is enkele tientallen kB, een Twilio-formulier een paar kB.

export const WEBHOOK_MAX = {
  stripe: 2 * 1024 * 1024,
  didit: 2 * 1024 * 1024,
  twilio: 256 * 1024,
  whatsapp: 64 * 1024,
} as const;

export type WebhookTekst = { ok: true; tekst: string } | { ok: false; response: NextResponse };

export async function webhookTekst(request: Request, max: number): Promise<WebhookTekst> {
  try {
    return { ok: true, tekst: await tekstBegrensd(request, max) };
  } catch (err) {
    if (err instanceof AppError) {
      return { ok: false, response: NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status }) };
    }
    throw err;
  }
}
