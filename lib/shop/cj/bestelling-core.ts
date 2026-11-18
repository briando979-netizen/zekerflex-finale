// ---------------------------------------------------------------------------
// Een webshopbestelling doorzetten naar CJ Dropshipping, het pure deel (18 nov 2026):
// de body voor shopping/order/createOrderV2, het antwoord lezen, de provincie voor het
// etiket (CJ eist er een), en de regel wanneer er uit het CJ-saldo betaald mag worden.
// Geen netwerk en geen database; dat staat in lib/shop/cj/bestelling.ts.
// ---------------------------------------------------------------------------

const tekst = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const getal = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};
const usdCents = (v: unknown): number | null => {
  const n = getal(v);
  return n === null ? null : Math.round(n * 100);
};

/**
 * De provincie bij een Nederlandse postcode, op de eerste twee cijfers. Grof (postcodegebieden volgen de
 * provinciegrenzen niet precies), maar CJ eist een provincie op het etiket en PostNL bezorgt op postcode en huisnummer.
 */
export function provincieVanPostcode(postcode: string): string {
  const n = Number(postcode.replace(/\s+/g, "").slice(0, 2));
  if (!Number.isFinite(n)) return "Nederland";
  if (n === 13) return "Flevoland";
  if (n >= 10 && n <= 21) return "Noord-Holland";
  if (n >= 22 && n <= 33) return "Zuid-Holland";
  if (n >= 34 && n <= 39) return "Utrecht";
  if (n >= 40 && n <= 41) return "Gelderland";
  if (n === 42) return "Zuid-Holland";
  if (n >= 43 && n <= 45) return "Zeeland";
  if (n >= 46 && n <= 57) return "Noord-Brabant";
  if (n >= 58 && n <= 64) return "Limburg";
  if (n >= 65 && n <= 73) return "Gelderland";
  if (n >= 74 && n <= 77) return "Overijssel";
  if (n >= 78 && n <= 79) return "Drenthe";
  if (n >= 80 && n <= 83) return "Overijssel";
  if (n >= 84 && n <= 92) return "Friesland";
  if (n >= 93 && n <= 94) return "Drenthe";
  if (n >= 95 && n <= 99) return "Groningen";
  return "Nederland";
}

export interface CjBestelRegel {
  vid: string;
  quantity: number;
  naam: string;
  sku: string;
}

export interface BestelAdres {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
}

/** Ons bestelnummer bij CJ: herkenbaar en uniek per webshopbestelling. */
export const cjOrderNumber = (orderId: string) => `ZF-${orderId}`;

/**
 * De body voor createOrderV2. payType 3 = alleen aanmaken (betalen is een aparte, bewuste stap);
 * isSandbox 1 = proefbestelling zonder geld (CJ simuleert de betaling en verstuurt niets).
 */
export function cjOrderBody(order: BestelAdres, regels: CjBestelRegel[], o: { van: string; logistiek: string; sandbox: boolean }): Record<string, unknown> {
  const postcode = order.postalCode.replace(/\s+/g, "").toUpperCase().replace(/^(\d{4})([A-Z]{2})$/, "$1 $2");
  return {
    orderNumber: cjOrderNumber(order.id),
    shippingCountryCode: "NL",
    shippingCountry: "Netherlands",
    shippingProvince: provincieVanPostcode(order.postalCode),
    shippingCity: order.city.trim(),
    shippingAddress: order.address.trim(),
    shippingZip: postcode,
    shippingCustomerName: `${order.firstName} ${order.lastName}`.trim(),
    email: order.email.trim(),
    remark: "ZekerFlex Shop",
    fromCountryCode: o.van.toUpperCase(),
    logisticName: o.logistiek,
    payType: 3,
    isSandbox: o.sandbox ? 1 : 0,
    products: regels.map((r) => ({ vid: r.vid, quantity: r.quantity, storeProductName: r.naam.slice(0, 200), storeSku: r.sku.slice(0, 100) })),
  };
}

export interface CjOrderInfo {
  cjOrderId: string | null;
  orderNumber: string;
  status: string;
  bedragUsdCents: number | null;
  productUsdCents: number | null;
  verzendUsdCents: number | null;
  logistiek: string | null;
  trackNumber: string | null;
  vervoerder: string | null;
}

/** Het antwoord van createOrderV2, getOrderDetail of order/list (velden heten net anders) als één vorm. */
export function leesCjOrder(data: unknown): CjOrderInfo | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const cjOrderId = tekst(o.orderId) || null;
  const orderNumber = tekst(o.orderNumber) || tekst(o.orderNum);
  const status = tekst(o.orderStatus).toUpperCase();
  if (!cjOrderId && !orderNumber && !status) return null;
  return {
    cjOrderId,
    orderNumber,
    status,
    bedragUsdCents: usdCents(o.orderAmount),
    productUsdCents: usdCents(o.productAmount),
    verzendUsdCents: usdCents(o.postageAmount),
    logistiek: tekst(o.logisticName) || null,
    trackNumber: tekst(o.trackNumber) || null,
    vervoerder: tekst(o.trackingProvider) || null,
  };
}

/** Statussen van CJ (shopping/order): daarna verandert er niets meer. */
export const CJ_EINDSTATUS: ReadonlySet<string> = new Set(["DELIVERED", "CANCELLED"]);
export const isCjEind = (status: string) => CJ_EINDSTATUS.has(status.toUpperCase());

/** Status van CJ in gewone woorden voor Beheer. */
export function cjStatusTekst(status: string): string {
  switch (status.toUpperCase()) {
    case "CREATED":
    case "IN_CART":
      return "aangemaakt, nog niet betaald";
    case "UNPAID":
      return "wacht op betaling";
    case "UNSHIPPED":
    case "PENDING":
    case "PROCESSING":
      return "betaald, wordt ingepakt";
    case "SHIPPED":
      return "verzonden";
    case "DELIVERED":
      return "bezorgd";
    case "CANCELLED":
      return "geannuleerd";
    default:
      return status || "onbekend";
  }
}

/** Mag er uit het saldo betaald worden? Alleen onder de grens per bestelling en als het saldo toereikend is. */
export function magBetalen(o: { bedragEurCents: number | null; maxBetaalCents: number; saldoUsdCents: number | null; bedragUsdCents: number | null }): { ok: boolean; reden: string | null } {
  if (o.bedragUsdCents === null || o.bedragUsdCents <= 0) return { ok: false, reden: "CJ gaf geen bedrag voor deze bestelling." };
  if (o.bedragEurCents === null) return { ok: false, reden: "Er is geen dollarkoers om het bedrag te controleren." };
  if (o.bedragEurCents > o.maxBetaalCents) return { ok: false, reden: `Het bedrag (€ ${(o.bedragEurCents / 100).toFixed(2)}) is hoger dan de grens per bestelling (€ ${(o.maxBetaalCents / 100).toFixed(2)}).` };
  if (o.saldoUsdCents !== null && o.saldoUsdCents < o.bedragUsdCents) return { ok: false, reden: `Het CJ-saldo ($ ${(o.saldoUsdCents / 100).toFixed(2)}) is lager dan het bedrag ($ ${(o.bedragUsdCents / 100).toFixed(2)}). Waardeer eerst op bij CJ.` };
  return { ok: true, reden: null };
}
