// ---------------------------------------------------------------------------
// Verkopers op de ZekerFlex-marktplaats (pure regels, zonder database).
// Een geverifieerd bedrijf zet eigen producten in /shop. De beheerder keurt elk
// product goed voordat het zichtbaar wordt. De koper betaalt aan ZekerFlex; de
// verkoper verstuurt zelf, en krijgt het bedrag min de commissie uitbetaald
// zodra de bedenktijd voorbij is. De opslag staat in lib/shop/verkoper.ts.
// ---------------------------------------------------------------------------

/** Commissie van ZekerFlex in procenten van het verkoopbedrag (incl. btw), zoals op grote marktplaatsen. */
export const VERKOOP_COMMISSIE_PCT = 12;
/** Een verkoop staat vast als hij verzonden is en de bestelling zo oud is: 14 dagen bedenktijd na levering, plus bezorging en wat marge. */
export const VERKOPER_VAST_NA_DAGEN = 30;
/** Uitbetalen vanaf dit bedrag, zodat er geen losse centen worden overgemaakt. */
export const VERKOPER_UITBETALEN_VANAF_CENTS = 2500;
/** Binnen zoveel werkdagen na betaling verstuurt de verkoper. */
export const VERKOPER_VERZENDT_BINNEN_WERKDAGEN = 2;
/** Versie van de verkoopvoorwaarden; een nieuwe versie vraagt opnieuw akkoord. */
export const VERKOOPVOORWAARDEN_VERSIE = 1;

/** De categorieën waarin een verkoper mag aanbieden (dezelfde als de etalage). */
export const VERKOPER_CATEGORIEEN = ["Werk & PBM", "Kleding", "Werkdag", "Cadeaus"] as const;
export type VerkoperCategorie = (typeof VERKOPER_CATEGORIEEN)[number];
export const isVerkoperCategorie = (s: unknown): s is VerkoperCategorie => typeof s === "string" && (VERKOPER_CATEGORIEEN as readonly string[]).includes(s);

export type ProductStatus = "in_beoordeling" | "goedgekeurd" | "afgewezen" | "gepauzeerd";
export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  in_beoordeling: "Wacht op goedkeuring",
  goedgekeurd: "In de shop",
  afgewezen: "Afgewezen",
  gepauzeerd: "Gepauzeerd",
};
export const isProductStatus = (s: unknown): s is ProductStatus => typeof s === "string" && s in PRODUCT_STATUS_LABEL;

/** Alleen een goedgekeurd product staat in de shop; gepauzeerd, afgewezen of in beoordeling niet. */
export const zichtbaarInShop = (status: ProductStatus) => status === "goedgekeurd";

/**
 * Wat een verkoper aan een product mag wijzigen zonder nieuwe beoordeling: prijs
 * en voorraad. Naam, tekst, foto of categorie veranderen → opnieuw beoordelen
 * (anders kan een goedgekeurd product achteraf iets heel anders worden).
 */
export function vraagtNieuweBeoordeling(wijziging: { naam?: unknown; omschrijving?: unknown; categorie?: unknown; fotoUploadId?: unknown }): boolean {
  return wijziging.naam !== undefined || wijziging.omschrijving !== undefined || wijziging.categorie !== undefined || wijziging.fotoUploadId !== undefined;
}

/** De commissie over een verkoopbedrag, afgerond op hele centen. */
export function commissieCents(verkoopCents: number): number {
  if (!Number.isFinite(verkoopCents) || verkoopCents <= 0) return 0;
  return Math.round((verkoopCents * VERKOOP_COMMISSIE_PCT) / 100);
}

/** Een regel uit ShopOrder.itemsJson, voor zover de verkoopregels hem nodig hebben. */
export interface OrderRegel {
  priceCents: number;
  qty: number;
  sellerTenantId?: string | null | undefined;
}

export interface VerkoperDeel {
  tenantId: string;
  regels: number;
  stuks: number;
  verkoopCents: number;
  /** de verzendkosten van de bestelling, alleen als die helemaal van deze verkoper is */
  verzendCents: number;
  commissieCents: number;
  /** wat de verkoper krijgt: verkoop + verzending − commissie */
  uitbetalingCents: number;
}

/**
 * Splits een bestelling per verkoper. ZekerFlex-eigen regels (zonder verkoper)
 * tellen niet mee. De verzendkosten gaan naar de verkoper als de hele bestelling
 * van hem is (hij verstuurt alles); in een gemengde bestelling blijven ze bij
 * ZekerFlex, en verstuurt de verkoper zijn deel zonder extra kosten.
 */
export function verdeelPerVerkoper(regels: OrderRegel[], shippingCents: number): VerkoperDeel[] {
  const per = new Map<string, { regels: number; stuks: number; verkoopCents: number }>();
  let eigen = 0;
  for (const r of regels) {
    const bedrag = Math.max(0, Math.round(r.priceCents)) * Math.max(0, Math.floor(r.qty));
    if (!r.sellerTenantId) {
      eigen += 1;
      continue;
    }
    const d = per.get(r.sellerTenantId) ?? { regels: 0, stuks: 0, verkoopCents: 0 };
    d.regels += 1;
    d.stuks += Math.max(0, Math.floor(r.qty));
    d.verkoopCents += bedrag;
    per.set(r.sellerTenantId, d);
  }
  const alleenEen = eigen === 0 && per.size === 1;
  return [...per.entries()].map(([tenantId, d]) => {
    const verzendCents = alleenEen ? Math.max(0, shippingCents) : 0;
    const commissie = commissieCents(d.verkoopCents);
    return { tenantId, ...d, verzendCents, commissieCents: commissie, uitbetalingCents: d.verkoopCents + verzendCents - commissie };
  });
}

export type ShopOrderStatusLike = "PENDING_PAYMENT" | "RECEIVED" | "CONFIRMED" | "SHIPPED" | "CANCELLED" | "PAYMENT_FAILED";
export type VerkoopStatus = "wacht" | "verzenden" | "onderweg" | "vast" | "uitbetaald" | "vervallen";

export const VERKOOP_STATUS_LABEL: Record<VerkoopStatus, string> = {
  wacht: "Wacht op betaling",
  verzenden: "Nu versturen",
  onderweg: "Verzonden, in bedenktijd",
  vast: "Uit te betalen",
  uitbetaald: "Uitbetaald",
  vervallen: "Vervallen",
};

/** De stand van één verkoop, afgeleid van de bestelling en wat de verkoper deed. */
export function verkoopStatus(
  order: { status: ShopOrderStatusLike; createdAt: Date },
  verkoper: { verzonden: boolean; uitbetaald: boolean },
  now: Date = new Date(),
): VerkoopStatus {
  if (order.status === "CANCELLED" || order.status === "PAYMENT_FAILED") return "vervallen";
  if (order.status === "PENDING_PAYMENT") return "wacht";
  if (verkoper.uitbetaald) return "uitbetaald";
  if (!verkoper.verzonden) return "verzenden";
  const dagen = (now.getTime() - order.createdAt.getTime()) / 86_400_000;
  return dagen >= VERKOPER_VAST_NA_DAGEN ? "vast" : "onderweg";
}

/** Mag de verkoper het adres van de koper zien? Alleen als er betaald is en de bestelling niet vervallen is. */
export const adresZichtbaar = (s: VerkoopStatus) => s !== "wacht" && s !== "vervallen";

export interface VerkoopTotalen {
  bestellingen: number;
  omzetCents: number;
  commissieCents: number;
  teVersturen: number;
  lopendCents: number;
  vastCents: number;
  uitbetaaldCents: number;
}

/** Tellers voor het overzicht; niet betaalde en vervallen verkopen tellen niet mee. */
export function verkoopTotalen(rijen: { status: VerkoopStatus; verkoopCents: number; verzendCents: number; commissieCents: number; uitbetalingCents: number }[]): VerkoopTotalen {
  const t: VerkoopTotalen = { bestellingen: 0, omzetCents: 0, commissieCents: 0, teVersturen: 0, lopendCents: 0, vastCents: 0, uitbetaaldCents: 0 };
  for (const r of rijen) {
    if (r.status === "wacht" || r.status === "vervallen") continue;
    t.bestellingen += 1;
    t.omzetCents += r.verkoopCents + r.verzendCents;
    t.commissieCents += r.commissieCents;
    if (r.status === "verzenden") {
      t.teVersturen += 1;
      t.lopendCents += r.uitbetalingCents;
    }
    if (r.status === "onderweg") t.lopendCents += r.uitbetalingCents;
    if (r.status === "vast") t.vastCents += r.uitbetalingCents;
    if (r.status === "uitbetaald") t.uitbetaaldCents += r.uitbetalingCents;
  }
  return t;
}

/** Een url-naam voor een verkopersproduct: leesbaar deel van de naam plus een kort, uniek stukje. */
export function verkoperSlug(naam: string, uniek: string): string {
  const basis =
    naam
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "product";
  return `${basis}-${uniek.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6)}`;
}

/** Bekende vervoerders voor de track-en-trace-link naar de koper. */
export const VERVOERDERS = ["PostNL", "DHL", "DPD", "GLS", "UPS", "Anders"] as const;
export type Vervoerder = (typeof VERVOERDERS)[number];
export const isVervoerder = (s: unknown): s is Vervoerder => typeof s === "string" && (VERVOERDERS as readonly string[]).includes(s);

/** Een track-en-tracecode: letters, cijfers en streepjes, 6 tot 40 tekens. */
export const isTrackCode = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9-]{6,40}$/.test(s.trim());

/** De volgpagina van de vervoerder, of null als we die niet kennen. */
export function trackUrl(vervoerder: string, code: string): string | null {
  const c = encodeURIComponent(code.trim());
  switch (vervoerder) {
    case "PostNL":
      return `https://jouw.postnl.nl/track-and-trace/${c}`;
    case "DHL":
      return `https://www.dhl.com/nl-nl/home/tracking/tracking-parcel.html?submit=1&tracking-id=${c}`;
    case "DPD":
      return `https://tracking.dpd.de/status/nl_NL/parcel/${c}`;
    case "GLS":
      return `https://gls-group.com/NL/nl/volg-je-pakket?match=${c}`;
    case "UPS":
      return `https://www.ups.com/track?loc=nl_NL&tracknum=${c}`;
    default:
      return null;
  }
}

/** "12,95", "12.95", "€ 12" → centen; null als het geen geldig bedrag is. */
export function euroNaarCents(s: string): number | null {
  const t = s.replace(/€/g, "").replace(/\s+/g, "").trim();
  if (!/^\d{1,6}([.,]\d{1,2})?$/.test(t)) return null;
  const [heel = "0", deel = ""] = t.replace(",", ".").split(".");
  return Number(heel) * 100 + Number(deel.padEnd(2, "0"));
}
