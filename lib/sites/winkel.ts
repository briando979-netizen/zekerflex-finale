import { LEGE_WINKEL, slugify, type SiteProduct, type Winkel } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// De winkel van een klantsite: rekenen en controleren, zonder opslag of HTML.
// Client-veilig (de bouwer gebruikt dezelfde regels). Een bestelling rekent
// altijd met de prijzen van de gepubliceerde site, nooit met wat een formulier
// meestuurt. Weergave: lib/sites/winkel-render.ts; opslag: lib/sites/bestellingen.ts.
// ---------------------------------------------------------------------------

export const MAX_PER_PRODUCT = 99;

/** 1250 → "€ 12,50", 125000 → "€ 1.250,00" (vast formaat, op server en in de browser gelijk). */
export function euro(cents: number): string {
  const [heel, rest] = (Math.max(0, Math.round(cents)) / 100).toFixed(2).split(".");
  return `€ ${(heel ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${rest ?? "00"}`;
}

/** Wat iemand als bedrag typt ("€ 1.250,50", "4,5", "4.50") → centen; null als het geen bedrag is. */
export function leesBedrag(tekst: string): number | null {
  let s = tekst.replace(/[€\s]/g, "");
  if (!s) return null;
  s = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.round(n * 100) : null;
}

export const winkelVan =(site: { winkel?: Winkel | undefined }): Winkel => site.winkel ?? LEGE_WINKEL;

/** Wat bezoekers zien: zichtbare producten, in de volgorde van de bouwer. */
export const zichtbareProducten = (w: Winkel): SiteProduct[] => w.producten.filter((p) => p.zichtbaar);

/** De categorieën in de volgorde waarin ze voor het eerst voorkomen; zonder categorie telt niet mee. */
export function categorieen(producten: SiteProduct[]): string[] {
  return [...new Set(producten.map((p) => p.categorie.trim()).filter(Boolean))];
}

/** Een uniek webadres voor een product ("Desembrood wit" → "desembrood-wit", bij een dubbele "-2"). */
export function productSlug(naam: string, bestaand: string[]): string {
  const basis = slugify(naam) || "product";
  let slug = basis;
  for (let n = 2; bestaand.includes(slug); n++) slug = `${basis}-${n}`;
  return slug;
}

export type Levering = "afhalen" | "bezorgen";

export interface BestelInvoer {
  /** product-id → aantal */
  aantallen: Record<string, number>;
  levering: Levering;
  naam: string;
  email: string;
  telefoon: string;
  straat: string;
  postcode: string;
  plaats: string;
  opmerking: string;
}

/** Een leeg formulier (de bestelpagina vult er één product in vanaf een productpagina). */
export const LEGE_INVOER: BestelInvoer = { aantallen: {}, levering: "afhalen", naam: "", email: "", telefoon: "", straat: "", postcode: "", plaats: "", opmerking: "" };

/** Een bestelnummer zoals lib/sites/bestellingen.ts ze maakt: zes tekens zonder 0/O, 1/I/L. */
export const isBestelnummer = (s: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(s);

export interface BestelRegel {
  productId: string;
  naam: string;
  prijsCents: number;
  aantal: number;
  totaalCents: number;
}

export interface Bestelconcept {
  regels: BestelRegel[];
  subtotaalCents: number;
  bezorgkostenCents: number;
  totaalCents: number;
  invoer: BestelInvoer;
}

const knip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** Het bestelformulier uitlezen: n_<productId> = aantal, de rest als tekst met een maximum. */
export function leesBestelForm(form: { get(naam: string): unknown } & Iterable<[string, unknown]>): BestelInvoer {
  const aantallen: Record<string, number> = {};
  for (const [naam, waarde] of form) {
    const m = /^n_(p[a-z0-9]{6,20})$/.exec(naam);
    if (!m?.[1]) continue;
    const n = Math.floor(Number(waarde));
    if (Number.isFinite(n) && n > 0) aantallen[m[1]] = Math.min(MAX_PER_PRODUCT, n);
  }
  return {
    aantallen,
    levering: form.get("levering") === "bezorgen" ? "bezorgen" : "afhalen",
    naam: knip(form.get("naam"), 100),
    email: knip(form.get("email"), 200),
    telefoon: knip(form.get("telefoon"), 30),
    straat: knip(form.get("straat"), 120),
    postcode: knip(form.get("postcode"), 10),
    plaats: knip(form.get("plaats"), 80),
    opmerking: knip(form.get("opmerking"), 1000),
  };
}

/**
 * De bestelling uitrekenen en controleren tegen de winkel van de site. Fouten
 * zijn zinnen voor de bezoeker; zonder fouten is er een concept om te bevestigen.
 */
export function berekenBestelling(w: Winkel, invoer: BestelInvoer): { concept: Bestelconcept | null; fouten: string[] } {
  const fouten: string[] = [];
  if (!w.bestellen) return { concept: null, fouten: ["Online bestellen staat op deze website uit."] };

  const regels: BestelRegel[] = [];
  for (const p of zichtbareProducten(w)) {
    const aantal = invoer.aantallen[p.id] ?? 0;
    if (aantal <= 0) continue;
    if (p.uitverkocht) {
      fouten.push(`${p.naam} is uitverkocht.`);
      continue;
    }
    regels.push({ productId: p.id, naam: p.naam, prijsCents: p.prijsCents, aantal, totaalCents: p.prijsCents * aantal });
  }
  if (!regels.length && !fouten.length) fouten.push("Kies bij minstens één product hoeveel je wilt bestellen.");

  const levering: Levering = invoer.levering === "bezorgen" && w.levering.bezorgen ? "bezorgen" : w.levering.afhalen ? "afhalen" : "bezorgen";
  if (!invoer.naam) fouten.push("Vul je naam in.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(invoer.email)) fouten.push("Vul een geldig e-mailadres in.");
  if (invoer.telefoon.replace(/\D/g, "").length < 8) fouten.push("Vul je telefoonnummer in, dan kunnen we je bellen over je bestelling.");
  if (levering === "bezorgen" && (!invoer.straat || !invoer.postcode || !invoer.plaats)) fouten.push("Vul je adres in voor de bezorging (straat en huisnummer, postcode en plaats).");

  if (fouten.length) return { concept: null, fouten };
  const subtotaalCents = regels.reduce((som, r) => som + r.totaalCents, 0);
  const gratis = w.levering.gratisVanafCents != null && subtotaalCents >= w.levering.gratisVanafCents;
  const bezorgkostenCents = levering === "bezorgen" && !gratis ? Math.max(0, w.levering.bezorgkostenCents) : 0;
  return {
    concept: { regels, subtotaalCents, bezorgkostenCents, totaalCents: subtotaalCents + bezorgkostenCents, invoer: { ...invoer, levering } },
    fouten: [],
  };
}
