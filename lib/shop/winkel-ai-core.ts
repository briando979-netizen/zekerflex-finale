// De rekenregels van de Winkel-AI (Admin → Winkel-AI): prijs uit inkoop en
// marge, varianten, en een inkoopadvies uit voorraad en verkoop. Puur: geen
// database, geen AI. De AI stelt voor, deze regels rekenen, en de eigenaar
// keurt goed; er wordt hier nooit iets besteld of betaald.

import { btwTarief } from "@/lib/shop/modus";

export type MargeBeleid = {
  /** Marge als % van de verkoopprijs excl. btw (bijv. 55 = inkoop is 45 % van de verkoopprijs). */
  margePct: number;
  /** Levertijd van de leverancier in dagen. */
  leverdagen: number;
  /** Hoeveel dagen verkoop een bestelling moet dekken boven de levertijd. */
  dekkingDagen: number;
  /** Kleinste bestelhoeveelheid per variant (verpakking). */
  doosGrootte: number;
};
export const STANDAARD_BELEID: MargeBeleid = { margePct: 55, leverdagen: 7, dekkingDagen: 28, doosGrootte: 5 };

const grens = (n: unknown, min: number, max: number, std: number): number => (typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : std);

/** Beleid uit opgeslagen of ingevoerde waarden, binnen redelijke grenzen. */
export function leesBeleid(v: unknown): MargeBeleid {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  return {
    margePct: grens(o.margePct, 5, 90, STANDAARD_BELEID.margePct),
    leverdagen: Math.round(grens(o.leverdagen, 1, 90, STANDAARD_BELEID.leverdagen)),
    dekkingDagen: Math.round(grens(o.dekkingDagen, 7, 120, STANDAARD_BELEID.dekkingDagen)),
    doosGrootte: Math.round(grens(o.doosGrootte, 1, 100, STANDAARD_BELEID.doosGrootte)),
  };
}

/**
 * Verkoopprijs (incl. btw, in centen) uit de inkoopprijs excl. btw en de marge,
 * afgerond naar boven op x,95. `tarief`: 0,21 of 0,09 voor boeken.
 */
export function prijsUitInkoop(inkoopCents: number, margePct: number, tarief = 0.21): { prijsCents: number; exclCents: number; margeEchtPct: number } {
  const marge = Math.min(90, Math.max(0, margePct));
  const excl = inkoopCents / (1 - marge / 100);
  const incl = excl * (1 + tarief);
  const n = Math.max(0, Math.ceil((incl - 95) / 100));
  const prijsCents = n * 100 + 95;
  const exclEcht = prijsCents / (1 + tarief);
  return { prijsCents, exclCents: Math.round(exclEcht), margeEchtPct: Math.round(((exclEcht - inkoopCents) / exclEcht) * 1000) / 10 };
}

/** Marge die een bestaande prijs oplevert (% van de verkoopprijs excl. btw); null zonder inkoopprijs. */
export function margeVan(prijsCents: number, inkoopCents: number | null, tarief = 0.21): number | null {
  if (inkoopCents === null || inkoopCents <= 0 || prijsCents <= 0) return null;
  const excl = prijsCents / (1 + tarief);
  return Math.round(((excl - inkoopCents) / excl) * 1000) / 10;
}

export const slugVan = (naam: string): string =>
  naam
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

const LETTERS = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
/** Maten die de AI voorstelt, opschonen: alleen bekende lettermaten of getallen, ontdubbeld, hooguit 12. */
export function schoneMaten(maten: unknown): string[] {
  if (!Array.isArray(maten)) return [];
  const uit = new Set<string>();
  for (const m of maten) {
    const s = String(m).trim().toUpperCase().replace(/\s+/g, "");
    if (LETTERS.includes(s) || /^\d{2,3}(-\d{2,3})?$/.test(s)) uit.add(s);
  }
  return [...uit].slice(0, 12);
}

export function schoneKleuren(kleuren: unknown): string[] {
  if (!Array.isArray(kleuren)) return [];
  return [...new Set(kleuren.map((k) => String(k).trim().replace(/^./, (c) => c.toUpperCase())).filter((k) => k.length > 1 && k.length <= 24 && /^[\p{L} -]+$/u.test(k)))].slice(0, 8);
}

export type VariantRij = { size: string | null; color: string | null; stock: number; sku: string };

/** Alle combinaties van maat en kleur, met een sku en een startvoorraad (standaard 0: pas na de eerste inkoop te verkopen). */
export function maakVarianten(slug: string, maten: string[], kleuren: string[], stockPer = 0): VariantRij[] {
  const m: (string | null)[] = maten.length ? maten : [null];
  const k: (string | null)[] = kleuren.length ? kleuren : [null];
  return m.flatMap((size) => k.map((color) => ({ size, color, stock: Math.max(0, Math.floor(stockPer)), sku: [slug, size, color].filter(Boolean).join("-").toLowerCase().replace(/[^a-z0-9-]+/g, "") })));
}

// ---------------------------------------------------------------------------
// Inkoopadvies
// ---------------------------------------------------------------------------

export type InkoopInvoer = { variantId: string; productNaam: string; size: string | null; color: string | null; stock: number; verkocht30: number; inkoopCents: number | null };
export type InkoopRegel = InkoopInvoer & { perDag: number; dekkingDagen: number | null; bestel: number; kostenCents: number | null; reden: "uitverkocht" | "loopt-leeg" | "geen-verkoop" };

/**
 * Wat er per variant besteld moet worden om de levertijd plus de gewenste
 * dekking te halen, afgerond op hele dozen. Varianten die nog ruim genoeg
 * hebben komen er niet in. Een uitverkochte variant zonder verkoopcijfers
 * krijgt één doos als startvoorstel.
 */
export function inkoopAdvies(rijen: InkoopInvoer[], beleid: MargeBeleid = STANDAARD_BELEID): InkoopRegel[] {
  const uit: InkoopRegel[] = [];
  for (const r of rijen) {
    const perDag = r.verkocht30 / 30;
    const dekking = perDag > 0 ? r.stock / perDag : null;
    const doel = Math.ceil(perDag * (beleid.leverdagen + beleid.dekkingDagen));
    let bestel = Math.max(0, doel - r.stock);
    let reden: InkoopRegel["reden"] | null = null;
    if (bestel > 0) reden = r.stock <= 0 ? "uitverkocht" : "loopt-leeg";
    else if (r.stock <= 0 && r.verkocht30 === 0) (bestel = beleid.doosGrootte), (reden = "geen-verkoop");
    if (!reden || bestel <= 0) continue;
    bestel = Math.ceil(bestel / beleid.doosGrootte) * beleid.doosGrootte;
    uit.push({ ...r, perDag: Math.round(perDag * 100) / 100, dekkingDagen: dekking === null ? null : Math.round(dekking), bestel, kostenCents: r.inkoopCents === null ? null : r.inkoopCents * bestel, reden });
  }
  // eerst wat het eerst op raakt
  return uit.sort((a, b) => (a.dekkingDagen ?? -1) - (b.dekkingDagen ?? -1) || b.bestel - a.bestel);
}

export const inkoopTotaal = (regels: InkoopRegel[]) => ({ stuks: regels.reduce((s, r) => s + r.bestel, 0), kostenCents: regels.reduce((s, r) => s + (r.kostenCents ?? 0), 0), zonderPrijs: regels.filter((r) => r.kostenCents === null).length });

/** De btw-tarieven die voor de prijsberekening gelden (boeken 9 %). */
export const tariefVoor = (naam: string, slug = slugVan(naam)): number => btwTarief({ name: naam, slug });
