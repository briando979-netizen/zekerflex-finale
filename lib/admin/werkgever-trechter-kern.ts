// ---------------------------------------------------------------------------
// Admin → Sales & groei → Werkgeverstrechter: de pure telling (12 nov). Hoe ver komen echte bedrijven, en hoeveel
// bezoekers zien de werkgeverspagina's en klikken op de hoofdknop? Alleen aantallen, geen namen.
// lib/admin/werkgever-trechter.ts haalt de feiten op; dit bestand rekent alleen (en is dus te testen).
//
// Echt bedrijf: geen PLATFORM-tenant en minstens één lid dat geen testaccount is (isTestAccount in
// lib/admin/onboarding-model.ts: testadressen, eigen domein, beheer en sales, testbedrijfsnamen). Geverifieerd volgt
// verificatieUitFeiten (lib/company/verified.ts), dezelfde regel als de poort. De vensters tellen bedrijven die in
// die periode zijn aangemeld (een cohort), en per stap hoeveel van hen die stap al haalden.
// ---------------------------------------------------------------------------

export interface BedrijfFeiten {
  aangemeld: Date;
  echt: boolean;
  kvk: boolean;
  geverifieerd: boolean;
  vestiging: boolean;
  klusGeplaatst: boolean;
  /** een klus die verder kwam dan concept (DRAFT) */
  klusGepubliceerd: boolean;
  toewijzing: boolean;
}

export const BEDRIJF_STAPPEN = [
  { key: "aangemeld", label: "Aangemeld" },
  { key: "kvk", label: "KvK gekoppeld" },
  { key: "geverifieerd", label: "Geverifieerd" },
  { key: "vestiging", label: "Vestiging" },
  { key: "klusGeplaatst", label: "Klus geplaatst" },
  { key: "klusGepubliceerd", label: "Klus gepubliceerd" },
  { key: "toewijzing", label: "Eerste toewijzing" },
] as const;

export type StapKey = (typeof BEDRIJF_STAPPEN)[number]["key"];

/** De vensters: 7 dagen, 30 dagen en alles (null). */
export const VENSTERS = [7, 30, null] as const;
export type Venster = (typeof VENSTERS)[number];

const DAG = 86_400_000;
const binnen = (moment: Date, nu: Date, dagen: Venster) => dagen === null || nu.getTime() - moment.getTime() <= dagen * DAG;

function gehaald(b: BedrijfFeiten, key: StapKey): boolean {
  return key === "aangemeld" ? true : b[key];
}

/** Per stap: hoeveel echte bedrijven die in het venster zijn aangemeld deze stap haalden. */
export function bedrijfTrechter(bedrijven: readonly BedrijfFeiten[], nu: Date, dagen: Venster): { key: StapKey; label: string; aantal: number }[] {
  const cohort = bedrijven.filter((b) => b.echt && binnen(b.aangemeld, nu, dagen));
  return BEDRIJF_STAPPEN.map((s) => ({ key: s.key, label: s.label, aantal: cohort.filter((b) => gehaald(b, s.key)).length }));
}

// --- Bezoek -------------------------------------------------------------------

export const WERKGEVER_PAGINAS = ["/voor-bedrijven", "/voor-bureaus", "/klus-plaatsen", "/prijzen", "/demo"] as const;
export type WerkgeverPagina = (typeof WERKGEVER_PAGINAS)[number];

/**
 * De hoofdknop op die pagina's, zoals de klikteksten binnenkomen (12 nov gemeten): "Organisatie aanmelden",
 * "Gratis klus plaatsen", "Plaats deze klus", "Zet deze klus klaar", "Vraag een demo aan", "Demo aanvragen".
 */
// sinds 12 nov heeft de plaatsknop op /klus-plaatsen de code klus-plaatsknop (data-track) in plaats van de knoptekst
export const HOOFDKNOP = /organisatie aanmelden|klus plaatsen|plaats (deze|een|je|jouw) klus|zet deze klus klaar|demo aan(vragen)?|vraag een demo|^klus-plaatsknop$/i;

export interface BezoekRij {
  type: "PAGEVIEW" | "CLICK";
  path: string;
  sessionId: string;
  label: string | null;
  at: Date;
}

/** "/klus-plaatsen?functie=horeca" en "/prijzen/" tellen als de pagina zelf; andere paden niet. */
export function paginaVan(path: string): WerkgeverPagina | null {
  const kaal = (path.split(/[?#]/)[0] ?? "").replace(/\/+$/, "") || "/";
  return (WERKGEVER_PAGINAS as readonly string[]).includes(kaal) ? (kaal as WerkgeverPagina) : null;
}

/** Per pagina: unieke sessies die hem bekeken, en unieke sessies die daar op de hoofdknop klikten. */
export function bezoekPerPagina(rijen: readonly BezoekRij[], nu: Date, dagen: Venster): { pagina: WerkgeverPagina; sessies: number; klikken: number }[] {
  const bekeken = new Map<WerkgeverPagina, Set<string>>();
  const geklikt = new Map<WerkgeverPagina, Set<string>>();
  const voeg = (m: Map<WerkgeverPagina, Set<string>>, p: WerkgeverPagina, sessie: string) => {
    const set = m.get(p) ?? new Set<string>();
    set.add(sessie);
    m.set(p, set);
  };
  for (const r of rijen) {
    if (!binnen(r.at, nu, dagen) || r.at.getTime() > nu.getTime()) continue;
    const p = paginaVan(r.path);
    if (!p) continue;
    if (r.type === "PAGEVIEW") voeg(bekeken, p, r.sessionId);
    else if (r.label && HOOFDKNOP.test(r.label)) voeg(geklikt, p, r.sessionId);
  }
  return WERKGEVER_PAGINAS.map((p) => ({ pagina: p, sessies: bekeken.get(p)?.size ?? 0, klikken: geklikt.get(p)?.size ?? 0 }));
}
