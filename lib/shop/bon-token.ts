import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Getekende toegang tot de bon (PDF) van een webshopbestelling. Het bestelnummer
// alleen is geen geheim genoeg (het staat in mails, de adresbalk en logs): wie
// de bon wil openen heeft ook een token nodig dat bij dat nummer hoort.
// Vorm: `<verloopt-in-seconden>.<handtekening>`; de handtekening is een HMAC
// (AUTH_SECRET) over bestelnummer + verloop. Zo is er geen opslag of migratie
// nodig. De bon is er voor de boekhouding, dus de standaard is ruim: 400 dagen.
// Het token hoort in geen log (alleen in de link naar de klant).
// ---------------------------------------------------------------------------

const GELDIG_SECONDEN = 400 * 24 * 3600;
const SIG_LENGTH = 32; // base64url-tekens, ruim 190 bits

function handtekening(orderId: string, verloop: number): string {
  return createHmac("sha256", env.AUTH_SECRET).update(`shop-bon|${orderId}|${verloop}`).digest("base64url").slice(0, SIG_LENGTH);
}

export function bonToken(orderId: string, now = Date.now(), geldigSeconden = GELDIG_SECONDEN): string {
  const verloop = Math.floor(now / 1000) + geldigSeconden;
  return `${verloop}.${handtekening(orderId, verloop)}`;
}

export type BonTokenUitslag = "geldig" | "ongeldig" | "verlopen";

export function controleerBonToken(orderId: string, token: string | null | undefined, now = Date.now()): BonTokenUitslag {
  const m = /^(\d{9,12})\.([A-Za-z0-9_-]{32})$/.exec(token ?? "");
  if (!m) return "ongeldig";
  const verloop = Number(m[1]);
  const verwacht = Buffer.from(handtekening(orderId, verloop));
  const gegeven = Buffer.from(m[2] ?? "");
  if (verwacht.length !== gegeven.length || !timingSafeEqual(verwacht, gegeven)) return "ongeldig";
  return verloop * 1000 < now ? "verlopen" : "geldig";
}

/** Relatieve link naar de bon, met token. */
export function bonPad(orderId: string, now = Date.now()): string {
  return `/api/shop/orders/${orderId}/pdf?t=${bonToken(orderId, now)}`;
}
