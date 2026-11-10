import { pageSlug, type SiteSoort } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// De paginabouwer (components/app/SiteBuilder.tsx) werkt op de website én op de
// webshop van een bedrijf: elk een eigen site (lib/sites/store.ts siteOfTenant).
// Hier, puur en client-veilig: welke webadressen nooit een pagina mogen zijn,
// het adres van een nieuwe pagina, de API-adressen met `?soort=` en waar de
// bouwer in de studio staat. De server controleert de adressen nog een keer
// (lib/sites/schema.ts gebruikt dezelfde lijst).
// ---------------------------------------------------------------------------

/**
 * Webadressen die de site zelf gebruikt en die dus nooit een pagina mogen zijn: de winkel (/winkel,
 * productpagina's /p/…, /mand, /bestellen, /besteld), reserveren, de vaste pagina's en de bestanden
 * (lib/sites/serve.ts). Een pagina met zo'n adres zou de winkel onbereikbaar maken.
 */
export const GERESERVEERDE_SLUGS: readonly string[] = [
  "privacy",
  "bedankt",
  "media",
  "assets",
  "_zf",
  "sitemap",
  "robots",
  "p",
  "winkel",
  "bestellen",
  "besteld",
  "mand",
  "reserveren",
  "gereserveerd",
  "wat-kan-deze-site",
];

export const isGereserveerdeSlug = (slug: string): boolean => GERESERVEERDE_SLUGS.includes(slug);

/** Zoveel pagina's mag een site hebben (de homepagina meegeteld). */
export const MAX_PAGINAS = 12;

/** Langer mag het adres van een pagina niet zijn (lib/sites/schema.ts). */
const MAX_SLUG = 40;

/** Een vrij adres voor een nieuwe pagina: uit de titel, nooit gereserveerd en nooit dubbel. */
export function nieuweSlug(titel: string, bestaand: readonly string[]): string {
  let basis = pageSlug(titel) || "pagina";
  // "home" is in een knop of het menu al de homepagina (lib/sites/render.ts safeHref): zo'n pagina zou niemand vinden
  if (isGereserveerdeSlug(basis) || basis === "home") basis = `${basis}-info`;
  const kort = (s: string, ruimte: number) => s.slice(0, ruimte).replace(/-+$/g, "");
  let slug = kort(basis, MAX_SLUG);
  for (let n = 2; bestaand.includes(slug); n++) slug = `${kort(basis, MAX_SLUG - String(n).length - 1)}-${n}`;
  return slug;
}

/**
 * Het adres van een API van de bouwer: `base` + `pad`, met `?soort=` voor de site die hij bewerkt.
 * Zonder soort (een websitevoorstel, of de oude werkgever-bouwer) kiest de API zelf: de website.
 */
export function bouwerUrl(base: string, pad = "", soort: SiteSoort | null = null, query = ""): string {
  const q = [soort ? `soort=${soort}` : "", query].filter(Boolean).join("&");
  return `${base}${pad}${q ? `?${q}` : ""}`;
}

/** Waar de paginabouwer in de studio staat, per soort site. */
export const PAGINABOUWER: Record<SiteSoort, string> = { website: "/studio/website/bouwer", webshop: "/studio/webshop/paginas" };

/** De paginabouwer van deze soort, eventueel meteen op één pagina (`?pagina=<adres>`, "home" voor de homepagina). */
export function paginaBouwerHref(soort: SiteSoort, slug?: string): string {
  const pad = PAGINABOUWER[soort];
  return slug === undefined ? pad : `${pad}?pagina=${encodeURIComponent(slug || "home")}`;
}

/** Staat dit studiopad in een paginabouwer (die heeft de volle breedte en een eigen knop Publiceren)? */
export const isPaginaBouwer = (path: string): boolean => Object.values(PAGINABOUWER).some((b) => path === b || path.startsWith(`${b}/`));

/** De pagina die de bouwer als eerste toont: die met dit adres ("home" of "" = de homepagina), anders null. */
export function beginPaginaId(pages: readonly { id: string; slug: string }[], slug: string | undefined): string | null {
  if (slug === undefined) return null;
  const s = slug === "home" ? "" : slug;
  return pages.find((p) => p.slug === s)?.id ?? null;
}
