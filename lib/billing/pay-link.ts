import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Public pay link for one invoice: /betaal/<invoiceId>.<signature>. It is
// printed (as a QR code) on the invoice PDF, so whoever holds the invoice can
// pay it on their phone without logging in — the HMAC makes the link
// unguessable, so invoice ids can't be enumerated.
// ---------------------------------------------------------------------------

const SIG_LENGTH = 22; // base64url chars ≈ 132 bits

function signature(invoiceId: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(`invoice-pay:${invoiceId}`).digest("base64url").slice(0, SIG_LENGTH);
}

export function payToken(invoiceId: string): string {
  return `${invoiceId}.${signature(invoiceId)}`;
}

export function payUrl(invoiceId: string): string {
  return `${env.APP_BASE_URL.replace(/\/$/, "")}/betaal/${payToken(invoiceId)}`;
}

/** The invoice id the token was issued for, or null when it's malformed or forged. */
export function verifyPayToken(token: string): string | null {
  const match = /^([a-z0-9]{10,40})\.([A-Za-z0-9_-]{22})$/.exec(token);
  if (!match) return null;
  const [, invoiceId, sig] = match as unknown as [string, string, string];
  const expected = Buffer.from(signature(invoiceId));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? invoiceId : null;
}
