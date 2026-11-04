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

export const winkelVan = (site: { winkel?: Winkel | undefined }): Winkel => site.winkel ?? LEGE_WINKEL;

/** Uitverkocht: met de hand aangezet, of de bijgehouden voorraad is op. */
export const isUitverkocht = (p: Pick<SiteProduct, "uitverkocht" | "voorraad">): boolean => p.uitverkocht || (p.voorraad != null && p.voorraad <= 0);

/** Hoeveel er in één keer te bestellen is: 99, of minder als de voorraad lager is. */
export const maxBestelbaar = (p: Pick<SiteProduct, "voorraad">): number => Math.max(0, Math.min(MAX_PER_PRODUCT, p.voorraad ?? MAX_PER_PRODUCT));

/** Na een bestelling: de bijgehouden voorraad omlaag (nooit onder 0); producten zonder bijgehouden voorraad blijven zoals ze zijn. */
export function verlaagVoorraad(w: Winkel, regels: Pick<BestelRegel, "productId" | "aantal">[]): Winkel {
  const besteld = new Map<string, number>();
  for (const r of regels) besteld.set(r.productId, (besteld.get(r.productId) ?? 0) + r.aantal);
  return { ...w, producten: w.producten.map((p) => (p.voorraad != null && besteld.has(p.id) ? { ...p, voorraad: Math.max(0, p.voorraad - (besteld.get(p.id) ?? 0)) } : p)) };
}

export const MAX_OPTIES = 2;

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
  /**
   * regel → aantal. Een regel is het product-id, of voor een tweede (derde…) maat of kleur van
   * hetzelfde product "<id>-1", "<id>-2" (uit de winkelmand, lib/sites/mand.ts)
   */
  aantallen: Record<string, number>;
  /** regel → de gekozen waarde per optie (maat, kleur), in de volgorde van de opties */
  keuzes: Record<string, string[]>;
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
export const LEGE_INVOER: BestelInvoer = { aantallen: {}, keuzes: {}, levering: "afhalen", naam: "", email: "", telefoon: "", straat: "", postcode: "", plaats: "", opmerking: "" };

/** Een bestelnummer zoals lib/sites/bestellingen.ts ze maakt: zes tekens zonder 0/O, 1/I/L. */
export const isBestelnummer = (s: string) => /^[A-HJ-NP-Z2-9]{6}$/.test(s);

export interface BestelRegel {
  productId: string;
  /** met de gekozen variant erachter: "Hoodie (M, Zwart)" */
  naam: string;
  /** de gekozen variant: "M, Zwart" */
  variant?: string | undefined;
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

/** De regels van een product in het bestelformulier: het id zelf, dan "<id>-1" tot "<id>-9" (andere maten of kleuren). */
export const regelSleutels = (productId: string): string[] => [productId, ...Array.from({ length: 9 }, (_, i) => `${productId}-${i + 1}`)];

const knip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** Het bestelformulier uitlezen: n_<productId> = aantal, k_<productId>_<optie> = keuze, de rest als tekst met een maximum. */
export function leesBestelForm(form: { get(naam: string): unknown } & Iterable<[string, unknown]>): BestelInvoer {
  const aantallen: Record<string, number> = {};
  const keuzes: Record<string, string[]> = {};
  for (const [naam, waarde] of form) {
    const k = /^k_(p[a-z0-9]{6,20}(?:-[1-9])?)_([01])$/.exec(naam);
    if (k?.[1] && k[2]) {
      (keuzes[k[1]] ??= [])[Number(k[2])] = knip(waarde, 40);
      continue;
    }
    const m = /^n_(p[a-z0-9]{6,20}(?:-[1-9])?)$/.exec(naam);
    if (!m?.[1]) continue;
    const n = Math.floor(Number(waarde));
    if (Number.isFinite(n) && n > 0) aantallen[m[1]] = Math.min(MAX_PER_PRODUCT, n);
  }
  return {
    aantallen,
    keuzes,
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
    // een product kan meer regels hebben: elke andere maat of kleur uit de winkelmand een eigen regel
    const sleutels = regelSleutels(p.id).filter((k) => (invoer.aantallen[k] ?? 0) > 0);
    if (!sleutels.length) continue;
    const totaal = sleutels.reduce((som, k) => som + (invoer.aantallen[k] ?? 0), 0);
    if (isUitverkocht(p)) {
      fouten.push(`${p.naam} is uitverkocht.`);
      continue;
    }
    if (p.voorraad != null && totaal > p.voorraad) {
      fouten.push(`Van ${p.naam} ${p.voorraad === 1 ? "is er nog 1" : `zijn er nog ${p.voorraad}`}.`);
      continue;
    }
    for (const k of sleutels) {
      const aantal = invoer.aantallen[k] ?? 0;
      // elke optie (maat, kleur) moet een bestaande keuze hebben
      const gekozen = invoer.keuzes[k] ?? [];
      const opties = p.opties ?? [];
      const mist = opties.find((o, i) => !o.waarden.includes(gekozen[i] ?? ""));
      if (mist) {
        fouten.push(`Kies ${mist.naam.toLowerCase()} bij ${p.naam}.`);
        continue;
      }
      const variant = opties.length ? opties.map((_, i) => gekozen[i]).join(", ") : undefined;
      regels.push({ productId: p.id, naam: variant ? `${p.naam} (${variant})` : p.naam, ...(variant ? { variant } : {}), prijsCents: p.prijsCents, aantal, totaalCents: p.prijsCents * aantal });
    }
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
