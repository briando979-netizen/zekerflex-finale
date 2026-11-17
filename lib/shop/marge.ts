// ---------------------------------------------------------------------------
// Marge en winst van de webshop, puur (geen database). Eén rekenregel voor alles:
// verkoopprijs incl. btw → excl. btw → min inkoop, verzending en betaalkosten = winst.
// Beheer → Winkel-AI → Marges laat per product zien wat één verkoop oplevert, en
// uit de echte bestellingen wat er tot nu toe verdiend is (alleen betaalde bestellingen,
// nooit een bestelling die nog op betaling wacht of geannuleerd is).
// ---------------------------------------------------------------------------

export interface WinstPerStuk {
  verkoopCents: number;
  exclCents: number;
  btwCents: number;
  inkoopCents: number;
  verzendCents: number;
  betaalCents: number;
  winstCents: number;
  /** winst als % van de verkoopprijs excl. btw; null zonder inkoopprijs */
  margePct: number | null;
}

/**
 * Wat één verkocht stuk oplevert. `betaalPct`: kosten van de betaalkaart als % van het bedrag incl. btw
 * (overschrijving 0, Stripe/iDEAL ±1,5 %); `tarief` 0,21 of 0,09 (boeken).
 */
export function winstPerStuk(verkoopCents: number, inkoopCents: number | null, opties: { verzendCents?: number; betaalPct?: number; tarief?: number } = {}): WinstPerStuk {
  const tarief = opties.tarief ?? 0.21;
  const verzend = Math.max(0, Math.round(opties.verzendCents ?? 0));
  const betaal = Math.round(Math.max(0, verkoopCents) * Math.max(0, opties.betaalPct ?? 0) / 100);
  const excl = Math.round(Math.max(0, verkoopCents) / (1 + tarief));
  const btw = Math.max(0, verkoopCents) - excl;
  const inkoop = inkoopCents !== null && inkoopCents > 0 ? Math.round(inkoopCents) : 0;
  const winst = excl - inkoop - verzend - betaal;
  return {
    verkoopCents,
    exclCents: excl,
    btwCents: btw,
    inkoopCents: inkoop,
    verzendCents: verzend,
    betaalCents: betaal,
    winstCents: winst,
    margePct: inkoopCents !== null && inkoopCents > 0 && excl > 0 ? Math.round((winst / excl) * 1000) / 10 : null,
  };
}

/** Een bestelregel zoals ShopOrder.itemsJson die bewaart (app/api/shop/orders/route.ts). */
export interface BestelRegel {
  productId: string;
  priceCents: number;
  qty: number;
}

export interface BestellingVoorWinst {
  status: string;
  itemsJson: unknown;
}

/** Alleen deze bestellingen zijn echt (betaald of verder); PENDING_PAYMENT, PAYMENT_FAILED en CANCELLED tellen niet. */
export const VERKOCHT_STATUS = new Set(["RECEIVED", "CONFIRMED", "SHIPPED"]);

export function leesRegels(itemsJson: unknown): BestelRegel[] {
  if (!Array.isArray(itemsJson)) return [];
  const uit: BestelRegel[] = [];
  for (const r of itemsJson) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const productId = typeof o.productId === "string" ? o.productId : "";
    const priceCents = typeof o.priceCents === "number" ? o.priceCents : NaN;
    const qty = typeof o.qty === "number" ? o.qty : 1;
    if (!productId || !Number.isFinite(priceCents) || qty <= 0) continue;
    uit.push({ productId, priceCents, qty: Math.round(qty) });
  }
  return uit;
}

export interface WinstPerProduct {
  productId: string;
  stuks: number;
  omzetCents: number;
  winstCents: number;
}

export interface WinstTotaal {
  bestellingen: number;
  stuks: number;
  omzetCents: number;
  inkoopCents: number;
  winstCents: number;
  perProduct: WinstPerProduct[];
}

/** Wat een product ons per stuk kost, of (verkopersproduct) wat we er vast aan overhouden: de commissie. */
export type KostenVanProduct = { inkoopCents: number | null; verzendCents: number; tarief?: number; winstVastCents?: undefined } | { winstVastCents: number };

/** Winst per stuk, ook voor een verkopersproduct (dan is de winst de commissie en is er geen inkoop). */
export function winstVoor(priceCents: number, k: KostenVanProduct, betaalPct = 0): WinstPerStuk {
  if (k.winstVastCents !== undefined) {
    const w = winstPerStuk(priceCents, null, { betaalPct: 0 });
    return { ...w, winstCents: Math.round(k.winstVastCents), margePct: w.exclCents > 0 ? Math.round((k.winstVastCents / w.exclCents) * 1000) / 10 : null };
  }
  return winstPerStuk(priceCents, k.inkoopCents, { verzendCents: k.verzendCents, betaalPct, ...(k.tarief !== undefined ? { tarief: k.tarief } : {}) });
}

/**
 * Winst uit echte bestellingen. `kosten(productId)` geeft de inkoopprijs (null = onbekend, telt als 0 inkoop
 * en wordt dus te rooskleurig: de lijst per product laat dat zien) en de verzendkosten per stuk, of voor een
 * verkopersproduct de vaste winst (onze commissie).
 */
export function winstUitBestellingen(
  bestellingen: readonly BestellingVoorWinst[],
  kosten: (productId: string) => KostenVanProduct,
  betaalPct = 0,
): WinstTotaal {
  const per = new Map<string, WinstPerProduct>();
  let aantal = 0;
  let stuks = 0;
  let omzet = 0;
  let inkoop = 0;
  let winst = 0;
  for (const b of bestellingen) {
    if (!VERKOCHT_STATUS.has(b.status)) continue;
    const regels = leesRegels(b.itemsJson);
    if (!regels.length) continue;
    aantal++;
    for (const r of regels) {
      const w = winstVoor(r.priceCents, kosten(r.productId), betaalPct);
      stuks += r.qty;
      omzet += r.priceCents * r.qty;
      inkoop += w.inkoopCents * r.qty;
      winst += w.winstCents * r.qty;
      const p = per.get(r.productId) ?? { productId: r.productId, stuks: 0, omzetCents: 0, winstCents: 0 };
      p.stuks += r.qty;
      p.omzetCents += r.priceCents * r.qty;
      p.winstCents += w.winstCents * r.qty;
      per.set(r.productId, p);
    }
  }
  return { bestellingen: aantal, stuks, omzetCents: omzet, inkoopCents: inkoop, winstCents: winst, perProduct: [...per.values()].sort((a, b) => b.winstCents - a.winstCents) };
}
