import { classifyVisit } from "@/lib/sites/stats-shared";
import { BASE, BLOG } from "@/lib/voorstel/smileyapp";
import { BRANCHES } from "@/lib/voorstel/smileyapp-branches";

// ---------------------------------------------------------------------------
// Bezoekcijfers van het SmileyApp-voorstel (19 nov 2026), zonder cookies en
// zonder iets over een bezoeker te bewaren: geen IP, geen referrer, geen
// apparaat. Er zijn alleen tellers per dag (lib/voorstel/smileyapp-cijfers.ts):
// weergaven, weergaven per pagina, binnenkomsten van buiten de site en het
// aantal demo-aanvragen. Dit bestand is puur: welk pad telt (een vaste lijst,
// zodat niemand de tellers kan volschrijven met verzonnen adressen), wie een
// robot is, en het optellen voor het scherm "Cijfers" in het beheer.
// ---------------------------------------------------------------------------

/** De pagina's die tellen, als kort pad (zoals op het subdomein), met de naam voor het beheer. */
const VASTE_PAGINAS: Record<string, string> = {
  "/": "Voorpagina",
  "/demo": "Demo aanvragen",
  "/contact": "Contact",
  "/partner-worden": "Partner worden",
  "/blog": "Blog",
  "/branches": "Branches",
  "/klanten": "Klantverhalen",
  // de vertalingen (19 nov 2026): de voorpagina en de demo-aanvraag in het Engels en het Duits
  "/en": "Voorpagina (Engels)",
  "/en/demo": "Demo aanvragen (Engels)",
  "/de": "Voorpagina (Duits)",
  "/de/demo": "Demo aanvragen (Duits)",
  // deel 6b: de vragenlijst zelf samenstellen en de vergelijking met papier
  "/samenstellen": "Vragenlijst samenstellen",
  "/vergelijken": "Vergelijken met papier",
};
/** De talen naast het Nederlands, met hun naam voor het beheer. */
const VERTALING_NAAM: Record<string, string> = { en: "Engels", de: "Duits" };
// deel 6b: deze pagina's bestaan ook in het Engels en het Duits (/en/contact, /de/klanten, …)
for (const [taal, naam] of Object.entries(VERTALING_NAAM)) {
  for (const pad of ["/contact", "/partner-worden", "/branches", "/klanten", "/samenstellen", "/vergelijken"]) {
    VASTE_PAGINAS[`/${taal}${pad}`] = `${VASTE_PAGINAS[pad] ?? pad} (${naam})`;
  }
}
/** Eén teller voor alle eigen blogberichten samen: hun adressen staan niet vast. */
export const EIGEN_BLOG = "/blog/*";
export const DEMO_PAD = "/demo";
/** De demo-aanvraag in alle talen: samen de noemer van het percentage, want de teller van aanvragen kent geen taal. */
export const DEMO_PADEN: readonly string[] = [DEMO_PAD, "/en/demo", "/de/demo"];

/**
 * Het pad waaronder een weergave telt, of null als hij niet telt. Accepteert het lange pad
 * (/voorstel/smileyapp/blog) en het korte van het subdomein (/blog). Het beheer telt nooit mee, een querystring
 * of anker wordt geweigerd (dat hoort de browser niet mee te sturen), en een onbekend adres (404) telt niet.
 */
export function telPad(ruw: unknown): string | null {
  if (typeof ruw !== "string" || ruw.length > 200 || !ruw.startsWith("/") || /[?#\s]/.test(ruw)) return null;
  let pad = ruw === BASE || ruw.startsWith(`${BASE}/`) ? ruw.slice(BASE.length) || "/" : ruw;
  if (pad.length > 1) pad = pad.replace(/\/+$/, "") || "/";
  if (pad === "/beheer" || pad.startsWith("/beheer/")) return null;
  if (Object.hasOwn(VASTE_PAGINAS, pad)) return pad;
  const blog = /^\/blog\/([a-z0-9-]{1,80})$/.exec(pad);
  if (blog) return BLOG.some((b) => b.slug === blog[1]) ? pad : EIGEN_BLOG;
  // een branchepagina, Nederlands of (deel 6b) in het Engels of het Duits
  const branche = /^(?:\/(?:en|de))?\/branches\/([a-z0-9-]{1,40})$/.exec(pad);
  if (branche?.[1] && Object.hasOwn(BRANCHES, branche[1])) return pad;
  return null;
}

/** De naam van een geteld pad voor het beheer. */
export function paginaNaam(pad: string): string {
  if (Object.hasOwn(VASTE_PAGINAS, pad)) return VASTE_PAGINAS[pad] ?? pad;
  if (pad === EIGEN_BLOG) return "Blog: eigen berichten";
  const blog = BLOG.find((b) => `/blog/${b.slug}` === pad);
  if (blog) return `Blog: ${blog.titel}`;
  const branche = /^(?:\/(en|de))?\/branches\/([a-z0-9-]{1,40})$/.exec(pad);
  const slug = branche?.[2] ?? "";
  if (slug && Object.hasOwn(BRANCHES, slug)) {
    const taal = branche?.[1] ? VERTALING_NAAM[branche[1]] : undefined;
    return `Branche: ${BRANCHES[slug]?.naam ?? slug}${taal ? ` (${taal})` : ""}`;
  }
  return pad;
}

/**
 * Is dit een mens met een gewone browser? Dezelfde regels als de bezoekcijfers van klantsites
 * (lib/sites/stats-shared.ts): zoekmachines, linkvoorbeelden, scripts, meetdiensten en vooruit ladende browsers
 * tellen niet. De telling komt hier als POST uit de pagina zelf, dus alleen de User-Agent en "purpose" doen ertoe.
 */
export function isMens(userAgent: string | null, purpose: string | null): boolean {
  return classifyVisit({ method: "GET", userAgent, referer: null, secFetchSite: null, secFetchDest: null, purpose }, []) !== null;
}

// ---- optellen voor het beheer ------------------------------------------------

export interface DagCijfer {
  dag: string;
  weergaven: number;
  aanvragen: number;
}

export interface Cijfers {
  dagen: DagCijfer[];
  weergaven: number;
  /** weergaven waarmee iemand van buiten de site binnenkwam */
  binnenkomsten: number;
  /** demo-aanvragen in deze periode */
  aanvragen: number;
  /** de vijf meest bekeken pagina's */
  paginas: { pad: string; naam: string; weergaven: number }[];
  /** weergaven van de demopagina, in alle talen samen (de noemer van het percentage) */
  demoWeergaven: number;
  /** demo-aanvragen per 100 bezoeken aan de demopagina; null als die pagina niet bezocht is */
  percentage: number | null;
}

/** Telt de dagtellers (veld → getal, zoals Redis ze teruggeeft) van `dagen` op. Velden: v, e, a en p:<pad>. */
export function somCijfers(dagen: readonly string[], hashes: readonly (Record<string, string> | null)[]): Cijfers {
  const paginas = new Map<string, number>();
  let weergaven = 0;
  let binnenkomsten = 0;
  let aanvragen = 0;
  const perDag = dagen.map((dag, i) => {
    const h = hashes[i] ?? {};
    const n = (veld: string) => Math.max(0, Math.floor(Number(h[veld] ?? 0)) || 0);
    weergaven += n("v");
    binnenkomsten += n("e");
    aanvragen += n("a");
    for (const veld of Object.keys(h)) {
      if (!veld.startsWith("p:")) continue;
      // alleen paden die we zelf tellen: een oud of vreemd veld komt niet op het scherm
      const pad = telPad(veld.slice(2)) === veld.slice(2) || veld.slice(2) === EIGEN_BLOG ? veld.slice(2) : null;
      if (pad) paginas.set(pad, (paginas.get(pad) ?? 0) + n(veld));
    }
    return { dag, weergaven: n("v"), aanvragen: n("a") };
  });
  const demoWeergaven = DEMO_PADEN.reduce((som, pad) => som + (paginas.get(pad) ?? 0), 0);
  return {
    dagen: perDag,
    weergaven,
    binnenkomsten,
    aanvragen,
    paginas: [...paginas]
      .map(([pad, aantal]) => ({ pad, naam: paginaNaam(pad), weergaven: aantal }))
      .sort((a, b) => b.weergaven - a.weergaven || a.pad.localeCompare(b.pad))
      .slice(0, 5),
    demoWeergaven,
    percentage: demoWeergaven > 0 ? Math.round((aanvragen / demoWeergaven) * 1000) / 10 : null,
  };
}
