// ---------------------------------------------------------------------------
// Welke URL's de dagelijkse IndexNow-ronde meldt (22 nov 2026). Eerst waren dat elke dag dezelfde 13 vaste paden, en Bing
// had daardoor maar 1 pagina opgenomen. Nu: draait er een nieuwe versie (lib/bouwer/versie.ts), dan de hele sitemap, tot
// de grens van IndexNow (10.000 URL's per melding); anders de vaste paden plus elke sitemap-regel met een lastModified in
// de laatste 3 dagen. De laatst gemelde versie staat in KV onder INDEXNOW_VERSIE_KV (één sleutel voor de hele site, niet
// per gebruiker). Puur: de route app/api/internal/seo/indexnow/route.ts leest en schrijft KV en verstuurt via
// pingIndexNow (lib/seo/indexnow.ts); tests/indexnow-keuze.test.ts test de keuze.
// ---------------------------------------------------------------------------

export const INDEXNOW_VERSIE_KV = "indexnow:laatste-versie";
/** IndexNow neemt hooguit 10.000 URL's per melding aan. */
export const INDEXNOW_MAX = 10_000;
/** Wat de sitemap in zoveel dagen als gewijzigd noemt, gaat ook mee als er geen nieuwe versie is. */
export const RECENT_DAGEN = 3;

/** De belangrijkste openbare pagina's: die gaan elke dag mee. */
export const VASTE_PADEN: readonly string[] = [
  "/", "/bedrijven", "/voor-freelancers", "/prijzen", "/klussen",
  "/starten-als-uitzendkracht", "/kennis", "/over-ons", "/app",
  "/rekentools", "/rekentools/zzp-uurtarief-berekenen", "/rekentools/kosten-uitzendkracht-berekenen", "/rekentools/wet-dba-check",
  "/bijbaan", "/werken-als",
];

/** Een regel uit app/sitemap.ts (MetadataRoute.Sitemap), alleen wat de keuze leest. */
export interface SitemapRegel {
  url: string;
  lastModified?: string | Date | undefined;
}

/** Wat er in KV staat na een geslaagde melding van een nieuwe versie. */
export interface GemeldeVersie {
  versie: string;
  /** ISO-tijd van de melding */
  op: string;
  /** hoeveel URL's er gemeld zijn */
  aantal: number;
}

/** Leest de opgeslagen versie soepel: een oud, leeg of kapot KV-item telt als "nog nooit gemeld". */
export function gemeldeVersie(raw: unknown): string | null {
  if (typeof raw === "string") return raw.trim() || null;
  if (raw && typeof raw === "object") {
    const v = (raw as { versie?: unknown }).versie;
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function tijdVan(v: string | Date | undefined): number | null {
  if (v === undefined || v === "") return null;
  const t = (v instanceof Date ? v : new Date(v)).getTime();
  return Number.isNaN(t) ? null : t;
}

export interface IndexNowKeuze {
  /** "alles": een nieuwe versie, dus de hele sitemap; "gewijzigd": de vaste paden plus wat recent veranderde */
  soort: "alles" | "gewijzigd";
  /** absolute URL's op de eigen host, zonder dubbele, hooguit INDEXNOW_MAX */
  urls: string[];
  /** na een geslaagde melding in KV zetten; null = niets onthouden */
  onthoud: string | null;
}

export function kiesIndexNowUrls(o: {
  /** de versie die nu draait (sha), of null als die onbekend is: dan nooit "alles" */
  versie: string | null;
  /** de laatst gemelde versie uit KV */
  vorige: string | null;
  regels: readonly SitemapRegel[];
  /** paden ("/prijzen") of absolute URL's die altijd meegaan */
  vast: readonly string[];
  /** SITE.url, bv. "https://zekerflex.com" */
  basis: string;
  nu: Date;
}): IndexNowKeuze {
  const basis = o.basis.replace(/\/+$/, "");
  const nieuw = o.versie !== null && o.versie !== o.vorige;
  const grens = o.nu.getTime() - RECENT_DAGEN * 86_400_000;
  const uitSitemap = nieuw
    ? o.regels
    : o.regels.filter((r) => {
        const t = tijdVan(r.lastModified);
        return t !== null && t >= grens;
      });
  const vast = o.vast.map((p) => (/^https?:\/\//.test(p) ? p : `${basis}${p.startsWith("/") ? p : `/${p}`}`));
  const eigen = (u: string) => u === basis || u.startsWith(`${basis}/`);
  const urls = [...new Set([...vast, ...uitSitemap.map((r) => r.url)])].filter(eigen).slice(0, INDEXNOW_MAX);
  return { soort: nieuw ? "alles" : "gewijzigd", urls, onthoud: nieuw ? o.versie : null };
}
