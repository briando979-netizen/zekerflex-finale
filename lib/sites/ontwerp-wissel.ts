import { MAX_PAGINAS } from "@/lib/sites/paginabouwer";
import type { OntwerpThema } from "@/lib/sites/ontwerpen";
import type { Block, BlockType, Page, SiteDoc, Theme } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// "Dit ontwerp gebruiken" op een site die er al is (Studio → Ontwerpen):
//  - standaard verandert alleen de stijl: kleuren, lettertype, hoeken en stijl.
//    Het logo, de pagina's, teksten, foto's, producten en bestellingen blijven;
//  - met "ook de pagina-opzet" komen de pagina's en blokken van het ontwerp die
//    de site nog niet heeft erbij. Wat er al staat, wordt nooit overschreven,
//    verplaatst of weggehaald;
//  - de vorige stijl en wat erbij kwam, worden bewaard (OntwerpWissel), zodat
//    "Ongedaan maken" de laatste wissel terugdraait. Een toegevoegd blok of een
//    toegevoegde pagina die het bedrijf daarna zelf aanpaste, blijft staan.
// Puur en client-veilig. Opslaan: app/api/werkgever/sites/ontwerp/route.ts.
// ---------------------------------------------------------------------------

/** Zoveel blokken mag een pagina hebben (lib/sites/schema.ts). */
export const MAX_BLOKKEN = 30;

/** Blokken die een wissel nooit toevoegt: een review hoort van een echte klant te komen. */
const NOOIT_TOEVOEGEN: ReadonlySet<BlockType> = new Set<BlockType>(["reviews"]);

/** Wat er vóór de laatste ontwerpwissel was, om die ongedaan te maken. */
export interface OntwerpWissel {
  ontwerpId: string;
  /** de naam van het gekozen ontwerp, voor de melding */
  naam: string;
  /** ISO-tijd van de wissel */
  at: string;
  vorigThema: Theme;
  /** de pagina's die erbij kwamen, zoals ze toen waren */
  paginas: Page[];
  /** de blokken die erbij kwamen op een pagina die er al was, zoals ze toen waren */
  blokken: { paginaId: string; blok: Block }[];
}

/** De stijl van het ontwerp, met het logo van het bedrijf. */
export function wisselThema(huidig: Theme, nieuw: OntwerpThema): Theme {
  return {
    kleur: nieuw.kleur,
    accent: nieuw.accent,
    lettertype: nieuw.lettertype,
    hoeken: nieuw.hoeken,
    stijl: nieuw.stijl,
    ...(huidig.logo !== undefined ? { logo: huidig.logo } : {}),
  };
}

/** Gebruikt de site dit ontwerp al (kleuren, letters, hoeken en stijl gelijk)? */
export function isHuidigOntwerp(theme: Theme, o: OntwerpThema): boolean {
  return (
    theme.kleur.toLowerCase() === o.kleur.toLowerCase() &&
    theme.accent.toLowerCase() === o.accent.toLowerCase() &&
    theme.lettertype === o.lettertype &&
    theme.hoeken === o.hoeken &&
    (theme.stijl ?? "standaard") === o.stijl
  );
}

/**
 * Zet wat er in `voorbeeld` staat en in `eigen` ontbreekt (zelfde sleutel) erbij, op de plek
 * waar het in het voorbeeld staat. Wat er al is, verschuift niet onderling en verdwijnt nooit.
 */
function vulAan<T>(eigen: readonly T[], voorbeeld: readonly T[], sleutel: (x: T) => string, max: number): { lijst: T[]; nieuw: T[] } {
  const lijst = [...eigen];
  const gekoppeld = new Set<T>();
  const nieuw: T[] = [];
  let plek = 0;
  for (const v of voorbeeld) {
    const i = lijst.findIndex((x) => !gekoppeld.has(x) && sleutel(x) === sleutel(v));
    if (i >= 0) {
      gekoppeld.add(lijst[i]!);
      plek = Math.max(plek, i + 1);
      continue;
    }
    if (lijst.length >= max) continue;
    lijst.splice(plek, 0, v);
    gekoppeld.add(v);
    nieuw.push(v);
    plek += 1;
  }
  return { lijst, nieuw };
}

const zonderVerzonnen = (p: Page): Page => ({ ...p, blocks: p.blocks.filter((b) => !NOOIT_TOEVOEGEN.has(b.type)) });

/**
 * De pagina-opzet van een ontwerp erbij: op een pagina die er al is (zelfde adres) de blokken die
 * ontbreken (per soort blok), en de pagina's die ontbreken. Bestaande blokken en teksten blijven precies zoals ze zijn.
 */
export function voegOpzetToe(eigen: readonly Page[], opzet: readonly Page[]): { pages: Page[]; paginas: Page[]; blokken: OntwerpWissel["blokken"] } {
  const schoon = opzet.map(zonderVerzonnen).filter((p) => p.blocks.length > 0);
  const blokken: OntwerpWissel["blokken"] = [];
  const aangevuld = eigen.map((p) => {
    const o = schoon.find((x) => x.slug === p.slug);
    if (!o) return p;
    const { lijst, nieuw } = vulAan(p.blocks, o.blocks, (b) => b.type, MAX_BLOKKEN);
    if (nieuw.length === 0) return p;
    for (const blok of nieuw) blokken.push({ paginaId: p.id, blok });
    return { ...p, blocks: lijst };
  });
  const { lijst, nieuw } = vulAan(aangevuld, schoon, (p) => p.slug, MAX_PAGINAS);
  return { pages: lijst, paginas: nieuw, blokken };
}

/** De site met de stijl van het ontwerp (en met `opzet` ook de ontbrekende pagina's en blokken), plus wat nodig is om terug te gaan. */
export function pasOntwerpToe<S extends Pick<SiteDoc, "theme" | "pages">>(
  site: S,
  ontwerp: { id: string; naam: string; thema: OntwerpThema },
  opzet: readonly Page[] | null,
  at: string,
): { site: S; wissel: OntwerpWissel } {
  const erbij = opzet ? voegOpzetToe(site.pages, opzet) : { pages: site.pages, paginas: [], blokken: [] };
  return {
    site: { ...site, theme: wisselThema(site.theme, ontwerp.thema), pages: erbij.pages },
    wissel: { ontwerpId: ontwerp.id, naam: ontwerp.naam, at, vorigThema: site.theme, paginas: erbij.paginas, blokken: erbij.blokken },
  };
}

/** Een vaste schrijfwijze (sleutels op volgorde), zodat "nog precies zoals toegevoegd" niet afhangt van de volgorde van velden. */
const vast = (x: unknown): string =>
  JSON.stringify(x, (_k, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v));

/** Leg de toegevoegde pagina's en blokken vast zoals ze na het opslaan in de site staan. */
export function zoalsOpgeslagen(w: OntwerpWissel, pages: readonly Page[]): OntwerpWissel {
  return {
    ...w,
    paginas: w.paginas.map((p) => pages.find((x) => x.id === p.id) ?? p),
    blokken: w.blokken.map((b) => ({ paginaId: b.paginaId, blok: pages.find((x) => x.id === b.paginaId)?.blocks.find((x) => x.id === b.blok.id) ?? b.blok })),
  };
}

/**
 * Draai de laatste wissel terug: de vorige stijl (met het logo zoals het nu is), en de pagina's en
 * blokken die de wissel toevoegde weg, maar alleen als ze nog precies zo zijn. `bleven`: hoeveel
 * toegevoegde pagina's en blokken het bedrijf intussen zelf aanpaste en dus blijven staan.
 */
export function maakOngedaan<S extends Pick<SiteDoc, "theme" | "pages">>(site: S, w: OntwerpWissel): { site: S; bleven: number } {
  let bleven = 0;
  const wegPaginas = new Set<string>();
  for (const p of w.paginas) {
    const nu = site.pages.find((x) => x.id === p.id);
    if (!nu) continue;
    if (vast(nu) === vast(p)) wegPaginas.add(p.id);
    else bleven += 1;
  }
  const wegBlokken = new Set<string>();
  for (const { paginaId, blok } of w.blokken) {
    const nu = site.pages.find((x) => x.id === paginaId)?.blocks.find((x) => x.id === blok.id);
    if (!nu) continue;
    if (vast(nu) === vast(blok)) wegBlokken.add(`${paginaId}/${blok.id}`);
    else bleven += 1;
  }
  const pages = site.pages
    .filter((p) => !wegPaginas.has(p.id))
    .map((p) => (p.blocks.some((b) => wegBlokken.has(`${p.id}/${b.id}`)) ? { ...p, blocks: p.blocks.filter((b) => !wegBlokken.has(`${p.id}/${b.id}`)) } : p));
  const { logo, ...vorig } = w.vorigThema;
  void logo;
  const theme: Theme = { ...vorig, ...(site.theme.logo !== undefined ? { logo: site.theme.logo } : {}) };
  return { site: { ...site, theme, pages }, bleven };
}
