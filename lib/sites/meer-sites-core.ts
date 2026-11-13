import type { SiteDoc, SiteSoort } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Meer dan één website of webshop per bedrijf (13 nov 2026, eigenaar: "al je sites op één plek, nieuwe site aanmaken").
// Zo werkt het, zonder dat de rest van het systeem verandert: een bedrijf heeft per soort nog steeds één site die "open
// staat" (de bestaande verwijzing in lib/sites/store.ts, waar de hele Studio op leunt). Daarnaast houden we een lijst bij van
// alle sites van het bedrijf. Een andere site openen = de verwijzing omzetten; de site zelf, zijn adres en wat online staat
// veranderen daar niet door. Bezoekers merken er niets van: een site wordt bezocht via zijn eigen adres, niet via de verwijzing.
// Puur bestand: de regels. De opslag staat in lib/sites/meer-sites.ts.
// ---------------------------------------------------------------------------

/** Hoogstens zoveel sites van één soort per bedrijf. */
export const MAX_SITES_PER_SOORT = 5;

const ID = /^s[a-z0-9]{6,20}$/;

/** Maakt van wat er in de opslag staat een nette lijst van site-id's: alleen geldige, elk één keer. */
export function leesLijst(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const uit: string[] = [];
  for (const v of raw) if (typeof v === "string" && ID.test(v) && !uit.includes(v)) uit.push(v);
  return uit.slice(0, 40);
}

/** De lijst met deze id's erbij (achteraan, zonder dubbele); lege waarden tellen niet. */
export function metIds(lijst: readonly string[], ...ids: (string | null | undefined)[]): string[] {
  return leesLijst([...lijst, ...ids.filter((v): v is string => typeof v === "string")]);
}

export const soortVanSite = (s: Pick<SiteDoc, "soort">): SiteSoort => s.soort ?? "website";

/** Mag er nog een site van deze soort bij? */
export function magErbij(sites: readonly Pick<SiteDoc, "soort">[], soort: SiteSoort): boolean {
  return sites.filter((s) => soortVanSite(s) === soort).length < MAX_SITES_PER_SOORT;
}

/** Wat het overzicht van een site toont. Geen inhoud van de site, alleen wat nodig is om hem te herkennen. */
export interface SiteRegel {
  id: string;
  soort: SiteSoort;
  naam: string;
  slug: string;
  online: boolean;
  /** de site die nu open staat in de Studio (van deze soort) */
  actief: boolean;
  bijgewerkt: string;
}

export function regelVan(s: SiteDoc, actieveIds: readonly string[]): SiteRegel {
  return { id: s.id, soort: soortVanSite(s), naam: s.bedrijf.naam, slug: s.slug, online: Boolean(s.liveBuild), actief: actieveIds.includes(s.id), bijgewerkt: s.updatedAt };
}

/** De sites in een vaste volgorde: eerst websites, dan webshops; binnen een soort de open site eerst, dan de nieuwste. */
export function sorteerRegels(regels: readonly SiteRegel[]): SiteRegel[] {
  return [...regels].sort((a, b) => (a.soort === b.soort ? Number(b.actief) - Number(a.actief) || b.bijgewerkt.localeCompare(a.bijgewerkt) : a.soort === "website" ? -1 : 1));
}
