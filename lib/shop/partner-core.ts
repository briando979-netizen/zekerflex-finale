// ---------------------------------------------------------------------------
// Partnerprogramma van de ZekerFlex-webshop (pure regels, zonder database).
// Een bedrijf deelt een link naar de shop (of naar één product); bestelt
// iemand via die link, dan verdient het bedrijf een vergoeding over het
// bedrag zonder btw. ZekerFlex levert, het bedrijf hoeft niets te doen.
// De opslag staat in lib/shop/partner.ts.
// ---------------------------------------------------------------------------

/** Vergoeding in procenten van de producten zonder btw (verzendkosten tellen niet mee). */
export const PARTNER_PCT = 10;
/** Pas na de bedenktijd (en wat marge voor de bezorging) staat een vergoeding vast. */
export const PARTNER_VAST_NA_DAGEN = 35;
/** Uitbetalen vanaf dit bedrag, zodat er geen losse centen worden overgemaakt. */
export const PARTNER_UITBETALEN_VANAF_CENTS = 2500;
const BTW = 0.21;

/** De vergoeding voor een bestelling: PARTNER_PCT van het productbedrag zonder btw, naar beneden afgerond op hele centen. */
export function partnerVergoedingCents(productenInclBtwCents: number): number {
  if (!Number.isFinite(productenInclBtwCents) || productenInclBtwCents <= 0) return 0;
  return Math.floor(((productenInclBtwCents / (1 + BTW)) * PARTNER_PCT) / 100);
}

/** Een partnercode: een leesbaar stuk van de bedrijfsnaam plus vier tekens, bv. "bakkerij-jansen-k7q2". */
export const PARTNER_CODE_RE = /^[a-z0-9](?:[a-z0-9-]{0,22}[a-z0-9])?-[a-z0-9]{4}$/;
export const isPartnerCode = (s: unknown): s is string => typeof s === "string" && s.length <= 30 && PARTNER_CODE_RE.test(s);

export function maakPartnerCode(bedrijfsnaam: string, vierTekens: string): string {
  const basis =
    bedrijfsnaam
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20)
      .replace(/-+$/g, "") || "partner";
  return `${basis}-${vierTekens.toLowerCase().replace(/[^a-z0-9]/g, "").padEnd(4, "0").slice(0, 4)}`;
}

export type ShopOrderStatusLike = "PENDING_PAYMENT" | "RECEIVED" | "CONFIRMED" | "SHIPPED" | "CANCELLED" | "PAYMENT_FAILED";
export type PartnerStatus = "wacht" | "verdiend" | "vast" | "uitbetaald" | "vervallen";

export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  wacht: "Wacht op betaling",
  verdiend: "Verdiend (in bedenktijd)",
  vast: "Uit te betalen",
  uitbetaald: "Uitbetaald",
  vervallen: "Vervallen",
};

/** De stand van één vergoeding, afgeleid van de bestelling zelf. */
export function partnerStatus(order: { status: ShopOrderStatusLike; createdAt: Date }, uitbetaald: boolean, now: Date = new Date()): PartnerStatus {
  if (order.status === "CANCELLED" || order.status === "PAYMENT_FAILED") return "vervallen";
  if (order.status === "PENDING_PAYMENT") return "wacht";
  if (uitbetaald) return "uitbetaald";
  const dagen = (now.getTime() - order.createdAt.getTime()) / 86_400_000;
  return dagen >= PARTNER_VAST_NA_DAGEN ? "vast" : "verdiend";
}

export interface PartnerTotalen {
  bestellingen: number;
  omzetCents: number;
  verdiendCents: number;
  vastCents: number;
  uitbetaaldCents: number;
}

/** Tellers voor het overzicht; vervallen en nog niet betaalde bestellingen tellen niet mee in de bedragen. */
export function partnerTotalen(rijen: { status: PartnerStatus; productenCents: number; vergoedingCents: number }[]): PartnerTotalen {
  const t: PartnerTotalen = { bestellingen: 0, omzetCents: 0, verdiendCents: 0, vastCents: 0, uitbetaaldCents: 0 };
  for (const r of rijen) {
    if (r.status === "vervallen" || r.status === "wacht") continue;
    t.bestellingen += 1;
    t.omzetCents += r.productenCents;
    if (r.status === "verdiend") t.verdiendCents += r.vergoedingCents;
    if (r.status === "vast") t.vastCents += r.vergoedingCents;
    if (r.status === "uitbetaald") t.uitbetaaldCents += r.vergoedingCents;
  }
  return t;
}
