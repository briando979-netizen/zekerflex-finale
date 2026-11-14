// ---------------------------------------------------------------------------
// Admin → Sales → Vindbronnen: meerdere vacaturepagina's tegelijk plakken (14 nov; 30 careers-URL's uit de regio
// Groningen/Zuidbroek). Per regel een URL of "label | URL", hooguit 50. Puur bestand (geen zod, geen prisma): de
// route geeft de URL-controle mee (lib/sales/bron-url.ts, dezelfde als bij één bron) en de URL's die er al staan.
// Toevoegen verstuurt niets; de crawler leest de pagina's later en maakt er in REVIEW hooguit concepten van.
// ---------------------------------------------------------------------------

export const MAX_BRONNEN_PLAKKEN = 50;

export type PlakStatus = "nieuw" | "dubbel" | "ongeldig";

export interface PlakRegel {
  /** regelnummer in het geplakte vak (1 = de eerste regel) */
  regel: number;
  label: string | null;
  url: string;
  status: PlakStatus;
  /** korte uitleg bij dubbel of ongeldig */
  reden: string | null;
}

export interface PlakUitslag {
  regels: PlakRegel[];
  nieuw: number;
  dubbel: number;
  ongeldig: number;
}

/** De niet-lege regels: "label | URL" (het laatste | telt) of alleen een URL. */
export function deelRegels(tekst: string): Array<{ regel: number; label: string | null; url: string }> {
  const uit: Array<{ regel: number; label: string | null; url: string }> = [];
  tekst.split(/\r?\n/).forEach((ruw, i) => {
    const r = ruw.trim();
    if (!r) return;
    const streep = r.lastIndexOf("|");
    const url = (streep >= 0 ? r.slice(streep + 1) : r).trim();
    const label = streep >= 0 ? r.slice(0, streep).trim().slice(0, 120) || null : null;
    uit.push({ regel: i + 1, label, url });
  });
  return uit;
}

/** Sleutel om dubbele te herkennen: host zonder www., pad zonder slash aan het eind, met de querystring; null als het geen URL is. */
export function bronSleutel(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const pad = u.pathname.replace(/\/+$/, "");
    return `${host}${pad}${u.search}`;
  } catch {
    return null;
  }
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Beoordeel elke regel: ongeldig (URL-controle of geen https), dubbel (staat er al, of hierboven) of nieuw. */
export function beoordeelBronnen(
  regels: Array<{ regel: number; label: string | null; url: string }>,
  bestaand: Array<string | null>,
  isGeldig: (url: string) => boolean,
): PlakUitslag {
  const al = new Set(bestaand.map(bronSleutel).filter((s): s is string => s !== null));
  const gezien = new Map<string, number>();
  const uit: PlakRegel[] = regels.map((r) => {
    if (!isGeldig(r.url)) return { ...r, status: "ongeldig", reden: "Geen geldige URL." };
    if (!isHttps(r.url)) return { ...r, status: "ongeldig", reden: "Alleen https." };
    const sleutel = bronSleutel(r.url);
    if (!sleutel) return { ...r, status: "ongeldig", reden: "Geen geldige URL." };
    if (al.has(sleutel)) return { ...r, status: "dubbel", reden: "Staat al bij deze campagne." };
    const eerder = gezien.get(sleutel);
    if (eerder !== undefined) return { ...r, status: "dubbel", reden: `Staat hierboven al (regel ${eerder}).` };
    gezien.set(sleutel, r.regel);
    return { ...r, status: "nieuw", reden: null };
  });
  return {
    regels: uit,
    nieuw: uit.filter((r) => r.status === "nieuw").length,
    dubbel: uit.filter((r) => r.status === "dubbel").length,
    ongeldig: uit.filter((r) => r.status === "ongeldig").length,
  };
}
