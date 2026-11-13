// ---------------------------------------------------------------------------
// Achtergrondbeeld bovenaan /shop en de homepage: puur gedeelte (geen KV, geen
// bestanden), zodat server, beheer en test hetzelfde lezen. Zonder keuze is er
// niets: de pagina ziet er dan precies uit als voorheen.
// ---------------------------------------------------------------------------

export const ACHTERGROND_PAGINAS = ["shop", "home"] as const;
export type AchtergrondPagina = (typeof ACHTERGROND_PAGINAS)[number];

/** Een gekozen foto of video uit de media-bibliotheek; bij een video optioneel een foto als stilstaand beeld. */
export interface AchtergrondKeuze {
  media: string;
  poster?: string;
}

export type AchtergrondInstelling = Record<AchtergrondPagina, AchtergrondKeuze | null>;

export const GEEN_ACHTERGROND: AchtergrondInstelling = { shop: null, home: null };

const isMediaId = (v: unknown): v is string => typeof v === "string" && /^m[a-z0-9]{10,30}$/.test(v);

/** Leest wat in de opslag staat soepel: onbruikbare onderdelen worden "geen", de rest blijft. */
export function leesInstelling(raw: unknown): AchtergrondInstelling {
  const uit: AchtergrondInstelling = { shop: null, home: null };
  if (!raw || typeof raw !== "object") return uit;
  const bron = raw as Record<string, unknown>;
  for (const pagina of ACHTERGROND_PAGINAS) {
    const k = bron[pagina];
    if (!k || typeof k !== "object") continue;
    const { media, poster } = k as Record<string, unknown>;
    if (!isMediaId(media)) continue;
    uit[pagina] = isMediaId(poster) ? { media, poster } : { media };
  }
  return uit;
}

/** De keuze uit een verzoek van de beheerder (null = geen achtergrond); ongeldig geeft undefined. */
export function leesKeuze(raw: unknown): AchtergrondKeuze | null | undefined {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return undefined;
  const { media, poster } = raw as Record<string, unknown>;
  if (!isMediaId(media)) return undefined;
  if (poster !== undefined && poster !== null && !isMediaId(poster)) return undefined;
  return isMediaId(poster) ? { media, poster } : { media };
}

export type AchtergrondWeergave =
  | { soort: "foto"; src: string; alt: string }
  | { soort: "video"; src: string; poster: string | null };

interface MediaVerwijzing {
  id: string;
  soort: "foto" | "video";
  alt: string;
}

/**
 * Wat de pagina toont. Is het bestand verwijderd uit de bibliotheek, dan niets
 * (de pagina valt terug op het gewone uiterlijk). De poster is altijd de kleine
 * versie van een foto: licht, en het eerste wat de bezoeker ziet.
 */
export function kiesWeergave(keuze: AchtergrondKeuze | null, media: MediaVerwijzing[]): AchtergrondWeergave | null {
  if (!keuze) return null;
  const item = media.find((m) => m.id === keuze.media);
  if (!item) return null;
  if (item.soort === "foto") return { soort: "foto", src: `/beeld/${item.id}`, alt: item.alt };
  const poster = keuze.poster ? media.find((m) => m.id === keuze.poster && m.soort === "foto") : undefined;
  return { soort: "video", src: `/beeld/${item.id}`, poster: poster ? `/beeld/${poster.id}?klein=1` : null };
}

/** Speelt de video af? Niet bij "minder beweging" en niet bij databesparing. */
export function magVideoSpelen(opties: { minderBeweging: boolean; dataBesparing: boolean }): boolean {
  return !opties.minderBeweging && !opties.dataBesparing;
}
