import { BLOG, type BlogBlok } from "@/lib/voorstel/smileyapp";

// ---------------------------------------------------------------------------
// Eigen blogberichten van het SmileyApp-team (19 nov 2026). De vier berichten
// van smileyapp.nl blijven vast in BLOG (lib/voorstel/smileyapp.ts); het team
// kan er in het beheer berichten bij schrijven: titel, datum, samenvatting en
// tekst (een lege regel is een nieuwe alinea), als concept of gepubliceerd.
// Dit bestand is puur: de regels (slug, controle, zichtbaar) en het samenvoegen
// met de vaste berichten. De opslag staat in lib/voorstel/smileyapp-blog.ts.
// ---------------------------------------------------------------------------

export const TITEL_MAX = 120;
export const SAMENVATTING_MAX = 300;
export const TEKST_MAX = 20_000;

export type BlogStatus = "concept" | "gepubliceerd";
export const BLOG_STATUSSEN = ["concept", "gepubliceerd"] as const;
export const BLOG_STATUS_LABEL: Record<BlogStatus, string> = { concept: "Concept", gepubliceerd: "Gepubliceerd" };

/** Een bericht dat het team zelf schreef, zoals het in de opslag staat. */
export interface EigenBericht {
  id: string;
  /** vast na het aanmaken, zodat een link blijft werken als de titel verandert */
  slug: string;
  titel: string;
  /** JJJJ-MM-DD; een datum in de toekomst = ingepland */
  datum: string;
  samenvatting: string;
  /** platte tekst; een lege regel begint een nieuwe alinea */
  tekst: string;
  status: BlogStatus;
  aangemaakt: string;
  gewijzigd: string;
  door?: string;
}

/** Wat het formulier in het beheer instuurt. */
export interface BerichtInvoer {
  titel: string;
  datum: string;
  samenvatting: string;
  tekst: string;
  status: string;
}

/** Een bericht zoals de blogpagina's het tonen: een vast bericht (met beeld) of een eigen bericht (zonder). */
export interface Bericht {
  slug: string;
  titel: string;
  datum: string;
  samenvatting: string;
  inhoud: readonly BlogBlok[];
  beeld?: { src: string; breed: number; hoog: number };
  eigen: boolean;
}

/** "Meten is weten: 3 tips & meer!" → "meten-is-weten-3-tips-en-meer" */
export function maakSlug(titel: string): string {
  const s = titel
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " en ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
  return s || "bericht";
}

/** Uniek naast de vaste berichten en de andere eigen berichten: "x", "x-2", "x-3", … */
export function uniekeSlug(basis: string, bezet: Iterable<string>): string {
  const alle = new Set([...BLOG.map((b) => b.slug), ...bezet]);
  if (!alle.has(basis)) return basis;
  let n = 2;
  while (alle.has(`${basis}-${n}`)) n += 1;
  return `${basis}-${n}`;
}

/** Tekst met lege regels ertussen → alinea's (geen HTML: React toont het als gewone tekst). */
export const alineas = (tekst: string) =>
  tekst
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((a) => a.replace(/[ \t]+\n/g, "\n").trim())
    .filter(Boolean);

/** Een echte kalenderdag als JJJJ-MM-DD (dus niet 2026-02-31). */
export function isDatum(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(`${d}T12:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

export const isBlogStatus = (s: unknown): s is BlogStatus => s === "concept" || s === "gepubliceerd";
export const isBerichtId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{16}$/.test(id);

export type BerichtControle =
  | { ok: true; waarde: Pick<EigenBericht, "titel" | "datum" | "samenvatting" | "tekst" | "status"> }
  | { ok: false; veld: keyof BerichtInvoer; fout: string };

export function valideerBericht(i: BerichtInvoer): BerichtControle {
  const fout = (veld: keyof BerichtInvoer, tekst: string): BerichtControle => ({ ok: false, veld, fout: tekst });
  const titel = i.titel.replace(/\s+/g, " ").trim();
  const samenvatting = i.samenvatting.replace(/\s+/g, " ").trim();
  const tekst = i.tekst.replace(/\r\n/g, "\n").trim();
  if (titel.length < 3) return fout("titel", "Geef het bericht een titel van minstens 3 tekens.");
  if (titel.length > TITEL_MAX) return fout("titel", `De titel mag hooguit ${TITEL_MAX} tekens zijn.`);
  if (!isDatum(i.datum)) return fout("datum", "Kies een geldige datum.");
  if (samenvatting.length < 10) return fout("samenvatting", "Schrijf een korte samenvatting van minstens 10 tekens. Die staat op de blogpagina onder de titel.");
  if (samenvatting.length > SAMENVATTING_MAX) return fout("samenvatting", `De samenvatting mag hooguit ${SAMENVATTING_MAX} tekens zijn.`);
  if (tekst.length > TEKST_MAX) return fout("tekst", `De tekst is te lang (hooguit ${TEKST_MAX} tekens).`);
  if (!isBlogStatus(i.status)) return fout("status", "Kies concept of gepubliceerd.");
  // een concept mag nog leeg zijn; wat op de site komt, heeft tekst
  if (i.status === "gepubliceerd" && alineas(tekst).length === 0) return fout("tekst", "Schrijf eerst de tekst van het bericht, of bewaar het als concept.");
  return { ok: true, waarde: { titel, datum: i.datum, samenvatting, tekst, status: i.status } };
}

/** Zichtbaar op de site: gepubliceerd en de datum is bereikt (een latere datum = ingepland). `vandaag` is de Nederlandse dag. */
export const zichtbaar = (b: Pick<EigenBericht, "status" | "datum">, vandaag: string) => b.status === "gepubliceerd" && b.datum <= vandaag;

const vast = (): Bericht[] =>
  BLOG.map((b) => ({ slug: b.slug, titel: b.titel, datum: b.datum, samenvatting: b.samenvatting, inhoud: b.inhoud, beeld: { src: b.beeld, breed: b.breed, hoog: b.hoog }, eigen: false }));

const alsBericht = (e: EigenBericht): Bericht => ({
  slug: e.slug,
  titel: e.titel,
  datum: e.datum,
  samenvatting: e.samenvatting,
  inhoud: alineas(e.tekst).map((tekst) => ({ type: "alinea" as const, tekst })),
  eigen: true,
});

/**
 * De berichten voor de blogpagina's: de vier vaste plus de zichtbare eigen berichten, nieuwste datum eerst. Bij
 * een gelijke datum staat een eigen bericht vóór de vaste, en de vaste houden hun eigen volgorde. Een eigen
 * bericht met de slug van een vast bericht telt niet mee (de opslag voorkomt dat al met uniekeSlug).
 */
export function blogLijst(eigen: readonly EigenBericht[], vandaag: string): Bericht[] {
  const vaste = vast();
  const bezet = new Set(vaste.map((b) => b.slug));
  const zelf = eigen
    .filter((e) => zichtbaar(e, vandaag) && !bezet.has(e.slug))
    .sort((a, b) => (a.datum === b.datum ? (a.aangemaakt < b.aangemaakt ? 1 : -1) : a.datum < b.datum ? 1 : -1))
    .map(alsBericht);
  const alle = [...zelf.map((b, i) => ({ b, rang: i })), ...vaste.map((b, i) => ({ b, rang: zelf.length + i }))];
  return alle.sort((x, y) => (x.b.datum === y.b.datum ? x.rang - y.rang : x.b.datum < y.b.datum ? 1 : -1)).map((x) => x.b);
}
