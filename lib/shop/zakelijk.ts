// De zakelijke winkel (/shop/zakelijk): pakketten per branche, een
// teambestelling (aantallen per maat) en het offerteverzoek. Puur: de pagina,
// de teambestelling in de browser en de API-route delen deze regels.

import { btwTarief, zonderBtw } from "@/lib/shop/modus";

export type Pakket = { id: string; slugs: string[]; /** look in de paskamer, als die er is */ look?: string };

/** Uitrusting per soort werk; alleen leverbare producten tellen mee (minimaal twee per pakket). */
export const PAKKETTEN: Pakket[] = [
  { id: "bouw", look: "bouwplaats", slugs: ["veiligheidshelm", "veiligheidsbril-helder", "veiligheidshesje", "werk-tshirt-2pack", "werkbroek-kniezakken", "kniebeschermers", "werkhandschoenen-grip", "veiligheidsschoenen-s3"] },
  { id: "magazijn", look: "magazijn", slugs: ["veiligheidshesje", "werk-tshirt-2pack", "werkbroek-kniezakken", "snijbestendige-handschoenen", "gehoorbescherming-oordoppen", "veiligheidssneakers-s1p"] },
  { id: "horeca", look: "horeca", slugs: ["werk-tshirt-2pack", "chino-broek-zakelijk", "antislip-werkschoenen-ob"] },
  { id: "schoonmaak", slugs: ["werk-tshirt-2pack", "werkhandschoenen-grip", "antislip-werkschoenen-ob"] },
  { id: "evenementen", slugs: ["veiligheidshesje", "softshell-werkjas", "gehoorbescherming-oordoppen", "veiligheidssneakers-s1p"] },
  { id: "kantoor", look: "kantoor-heren", slugs: ["business-overhemd-heren", "chino-broek-zakelijk", "zakelijk-riem-heren"] },
  { id: "nieuwe-collega", slugs: ["welcome-work-kit", "everyday-hoodie", "shift-bottle"] },
];

// Gangbare verdeling van maten in een ploeg (schatting om mee te beginnen; de klant past aan).
const LETTER_VERDELING: Record<string, number> = { XS: 4, S: 13, M: 28, L: 28, XL: 17, XXL: 8, "3XL": 2 };
const SCHOEN_VERDELING: Record<string, number> = { "38": 4, "39": 6, "40": 9, "41": 12, "42": 15, "43": 16, "44": 14, "45": 11, "46": 8, "47": 5 };

/**
 * Verdeel `aantal` mensen over de beschikbare maten volgens een gangbare
 * verdeling (grootste rest, dus de som klopt altijd). Onbekende maten (kind,
 * sokken) krijgen een gelijke verdeling.
 */
export function verdeelOverMaten(maten: string[], aantal: number): Record<string, number> {
  const n = Math.max(0, Math.min(10_000, Math.floor(aantal)));
  if (maten.length === 0 || n === 0) return Object.fromEntries(maten.map((m) => [m, 0]));
  const gewicht = (m: string) => LETTER_VERDELING[m.toUpperCase()] ?? SCHOEN_VERDELING[m] ?? 0;
  const ruw = maten.map(gewicht);
  const som = ruw.reduce((a, b) => a + b, 0);
  const w = som > 0 ? ruw : maten.map(() => 1);
  const totaal = som > 0 ? som : maten.length;
  const exact = w.map((x) => (x / totaal) * n);
  const heel = exact.map(Math.floor);
  let over = n - heel.reduce((a, b) => a + b, 0);
  const volgorde = exact.map((x, i) => ({ i, rest: x - Math.floor(x) })).sort((a, b) => b.rest - a.rest);
  for (const { i } of volgorde) {
    if (over <= 0) break;
    heel[i] = (heel[i] ?? 0) + 1;
    over--;
  }
  return Object.fromEntries(maten.map((m, i) => [m, heel[i] ?? 0]));
}

export type LijstRegel = { naam: string; slug: string; maat: string | null; kleur: string | null; aantal: number; centenIncl: number };

/** Totalen van een bestellijst: stuks, zonder btw, btw en met btw (per product het eigen tarief). */
export function lijstTotaal(regels: LijstRegel[]): { stuks: number; excl: number; btw: number; incl: number } {
  let stuks = 0;
  let excl = 0;
  let incl = 0;
  for (const r of regels) {
    stuks += r.aantal;
    incl += r.centenIncl * r.aantal;
    excl += zonderBtw(r.centenIncl, btwTarief({ slug: r.slug, name: r.naam })) * r.aantal;
  }
  return { stuks, excl, btw: incl - excl, incl };
}

const euro = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const veld = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** De bestellijst als CSV voor Excel (puntkomma's, komma als decimaalteken). */
export function lijstAlsCsv(regels: LijstRegel[], kop: { artikel: string; maat: string; kleur: string; aantal: string; stukExcl: string; totaalExcl: string }): string {
  const rijen = regels
    .filter((r) => r.aantal > 0)
    .map((r) => {
      const stuk = zonderBtw(r.centenIncl, btwTarief({ slug: r.slug, name: r.naam }));
      return [veld(r.naam), veld(r.maat ?? ""), veld(r.kleur ?? ""), String(r.aantal), euro(stuk), euro(stuk * r.aantal)].join(";");
    });
  return [[kop.artikel, kop.maat, kop.kleur, kop.aantal, kop.stukExcl, kop.totaalExcl].map(veld).join(";"), ...rijen].join("\r\n");
}

/** Een leesbare samenvatting van de lijst voor het offerteverzoek (en de mail aan sales). */
export function lijstSamenvatting(regels: LijstRegel[]): string {
  return regels
    .filter((r) => r.aantal > 0)
    .map((r) => `${r.aantal}× ${r.naam}${r.maat ? ` (maat ${r.maat})` : ""}${r.kleur ? ` – ${r.kleur}` : ""}`)
    .join("\n");
}

/** Wat een bedrijf bij een offerte kan aanvinken (het schema staat in offerte-schema.ts, met zod, alleen voor de server). */
export const OFFERTE_WENSEN = ["logo", "rekening", "vestigingen"] as const;
export type OfferteWens = (typeof OFFERTE_WENSEN)[number];
