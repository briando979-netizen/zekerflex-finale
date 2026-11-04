// ---------------------------------------------------------------------------
// De website en app van een rijschool op haar eigen domein (rijschooljansen.nl
// in plaats van zekerflex.com/rijschool/jansen). De middleware vraagt welke
// rijschool bij het domein hoort (lib/rijschool/domein.ts) en zet elk pad hier
// om. Edge-veilig: geen Node-code. Zelfde opzet als het voorstel-subdomein
// (lib/voorstel/subdomein.ts): alleen de rijschool is daar bereikbaar; de rest
// van ZekerFlex (login, dashboards, andere API's) geeft 404.
// ---------------------------------------------------------------------------

/** Gedeelde openbare API's die de rijschoolpagina's zelf gebruiken (kaart van de lesroute). */
const GEDEELDE_API = ["/api/kaart/"];
/** Bestanden van ZekerFlex zelf die de pagina's laden (lettertypes, kaartdata). */
const GEDEELDE_PADEN = ["/fonts/", "/kaart-data/"];

/** Het pad waarop de https-controle het bewijs vraagt (lib/sites/domain.ts, probeHttps). */
export const BEWIJS_PAD = "/.well-known/zekerflex-site";

/**
 * Een link binnen de site of app van de rijschool. `basis` is "" op haar eigen
 * domein (rijschooljansen.nl/proefles) en "/rijschool/<slug>" op zekerflex.com
 * (linkBasis in lib/rijschool/pagina.ts). Zonder deel is het de voorpagina.
 */
export function sitePad(basis: string, deel = ""): string {
  if (basis) return `${basis}${deel}`;
  return deel.startsWith("/") ? deel : `/${deel}`;
}

/**
 * Welk pad de app moet tonen voor een verzoek op het domein van rijschool `slug`,
 * of null als het daar niet bestaat. "/" wordt de website, "/leerling" de
 * leerling-app; paden die al onder /rijschool/<slug> vallen (links in de app),
 * de eigen API en de bestanden van Next blijven zoals ze zijn.
 */
export function rijschoolPad(slug: string, pad: string): string | null {
  const basis = `/rijschool/${slug}`;
  if (pad.startsWith("/_next/")) return pad;
  if (pad === BEWIJS_PAD) return "/api/rijschool/domein/bewijs";
  if (pad.startsWith("/api/")) {
    const eigen = pad.startsWith(`/api/rijschool/site/${slug}/`) || pad === `/api/rijschool/site/${slug}`;
    return eigen || GEDEELDE_API.some((p) => pad.startsWith(p)) ? pad : null;
  }
  // geen ZekerFlex-service-worker op het domein van de rijschool
  if (pad === "/sw.js") return null;
  if (pad === basis || pad.startsWith(`${basis}/`)) return pad;
  if (GEDEELDE_PADEN.some((p) => pad.startsWith(p))) return pad;
  // een ander /rijschool/<naam>: niet op dit domein
  if (pad.startsWith("/rijschool/")) return null;
  if (/\.[a-z0-9]{2,5}$/i.test(pad) && pad !== "/robots.txt") return pad;
  return pad === "/" ? basis : `${basis}${pad}`;
}

const linkPatroon = (basis: string) => new RegExp(`${basis.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/rijschool/([a-z0-9-]+)(?![a-z0-9-])/?`, "g");

/** De rijscholen (slugs) waarnaar een tekst linkt via `${basis}/rijschool/<slug>`. */
export function rijschoolLinksIn(tekst: string, basis: string): string[] {
  return [...new Set([...tekst.matchAll(linkPatroon(basis))].map((m) => m[1] ?? "").filter(Boolean))];
}

/**
 * Zet links naar zekerflex.com/rijschool/<slug>/… om naar https://<eigen domein>/…
 * voor de rijscholen in `adressen` (slug → https://domein). De rest blijft staan.
 */
export function naarEigenDomein(tekst: string, basis: string, adressen: ReadonlyMap<string, string>): string {
  if (adressen.size === 0) return tekst;
  return tekst.replace(linkPatroon(basis), (heel, slug: string) => {
    const adres = adressen.get(slug);
    return adres ? `${adres}/` : heel;
  });
}

/** robots.txt voor het domein: vindbaar als de website online staat, anders niet. */
export function robotsVoor(online: boolean): string {
  return online ? "User-agent: *\nAllow: /\n" : "User-agent: *\nDisallow: /\n";
}
