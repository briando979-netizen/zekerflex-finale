import { FOTOS } from "@/lib/marketing/fotos";

// ---------------------------------------------------------------------------
// Landingspagina's per campagne (17 nov 2026, eigenaar: "elke advertentie naar een eigen pagina"). De beheerder maakt in
// Beheer → Sales & groei → Campagnepagina's een pagina met een foto, een kop en één knop; hij staat op /c/<adres>.
// Puur (geen opslag): de regels voor het adres, de knop en de foto, zodat het formulier, de route en de test ze delen.
// De pagina is voor een advertentie, niet voor Google: noindex, en de knop gaat alleen naar een pagina van ZekerFlex zelf.
// ---------------------------------------------------------------------------

export type CampagneDoelgroep = "werker" | "bedrijf";

export interface CampagnePagina {
  /** het adres: /c/<slug> */
  slug: string;
  doelgroep: CampagneDoelgroep;
  /** eerste regel van de kop (wit) */
  kop: string;
  /** tweede regel van de kop (groen) */
  kopAccent: string;
  /** één of twee zinnen onder de kop */
  tekst: string;
  /** tot drie korte punten met een vinkje */
  punten: string[];
  knopTekst: string;
  /** sleutel uit CAMPAGNE_DOELEN */
  knopDoel: string;
  /** slug van een foto uit de fotobibliotheek (lib/marketing/fotos.ts) */
  foto: string;
  /** de pagina is zichtbaar; uit = 404 */
  aan: boolean;
  bijgewerkt: string;
}

/** Waar de knop heen mag: alleen eigen pagina's (nooit een adres van buiten, dus geen doorstuurfuik). */
export const CAMPAGNE_DOELEN: Record<string, { naam: string; href: string; voor: CampagneDoelgroep }> = {
  aanmelden: { naam: "Aanmelden als werker", href: "/register?type=freelancer", voor: "werker" },
  klussen: { naam: "Klussen bekijken", href: "/klussen", voor: "werker" },
  app: { naam: "De app installeren", href: "/app", voor: "werker" },
  "klus-plaatsen": { naam: "Een klus plaatsen", href: "/klus-plaatsen", voor: "bedrijf" },
  "bedrijf-aanmelden": { naam: "Aanmelden als bedrijf", href: "/register?type=employer", voor: "bedrijf" },
  demo: { naam: "Een demo aanvragen", href: "/demo", voor: "bedrijf" },
};

/** Adressen die al iets anders zijn of verwarring geven. */
const BEZET = new Set(["admin", "api", "login", "register", "nieuw", "test", "constructor", "prototype"]);

/** "Zomer horeca 2027!" → "zomer-horeca-2027"; leeg of bezet = null */
export function campagneSlug(invoer: string): string | null {
  const s = invoer
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  if (s.length < 3 || BEZET.has(s)) return null;
  return s;
}

export function campagneDoel(sleutel: string): { naam: string; href: string; voor: CampagneDoelgroep } | null {
  return Object.hasOwn(CAMPAGNE_DOELEN, sleutel) ? (CAMPAGNE_DOELEN[sleutel] ?? null) : null;
}

export const campagneFoto = (slug: string) => FOTOS.find((f) => f.slug === slug);

/** De foto's waaruit de beheerder kiest: de eigen campagnebeelden eerst. */
export const campagneFotoKeuzes = () => [...FOTOS].sort((a, b) => Number(Boolean(b.eigen)) - Number(Boolean(a.eigen))).map((f) => ({ slug: f.slug, naam: f.alt }));

/**
 * Wat er aan een ingevulde pagina niet klopt, in gewoon Nederlands (leeg = goed). De server gebruikt dezelfde regels als
 * het formulier. Beloftes die ZekerFlex niet waarmaakt (verzekerd, gegarandeerd, binnen een minuut betaald) houden we tegen:
 * een advertentiepagina is de plek waar zo'n zin het snelst insluipt.
 */
const VERBODEN = /verzekerd|gegarandeerd|garantie|binnen (1|een|één) minuut|direct uitbetaald|altijd werk/i;

export function campagneFouten(p: Omit<CampagnePagina, "bijgewerkt">): string[] {
  const fout: string[] = [];
  if (!campagneSlug(p.slug) || campagneSlug(p.slug) !== p.slug) fout.push("Kies een adres van minstens drie tekens, met alleen kleine letters, cijfers en streepjes.");
  if (p.kop.trim().length < 2 || p.kop.length > 28) fout.push("De eerste regel van de kop is 2 tot 28 tekens.");
  if (p.kopAccent.length > 28) fout.push("De tweede regel van de kop is hooguit 28 tekens.");
  if (p.tekst.trim().length < 10 || p.tekst.length > 220) fout.push("De tekst onder de kop is 10 tot 220 tekens.");
  if (p.punten.length > 3 || p.punten.some((x) => x.trim().length < 2 || x.length > 40)) fout.push("Hooguit drie punten, elk 2 tot 40 tekens.");
  if (p.knopTekst.trim().length < 2 || p.knopTekst.length > 32) fout.push("De tekst op de knop is 2 tot 32 tekens.");
  const doel = campagneDoel(p.knopDoel);
  if (!doel) fout.push("Kies waar de knop heen gaat.");
  else if (doel.voor !== p.doelgroep) fout.push(p.doelgroep === "werker" ? "Deze knop is voor bedrijven; kies een knop voor werkers." : "Deze knop is voor werkers; kies een knop voor bedrijven.");
  if (!campagneFoto(p.foto)) fout.push("Kies een foto uit de lijst.");
  const alles = [p.kop, p.kopAccent, p.tekst, p.knopTekst, ...p.punten].join(" ");
  if (VERBODEN.test(alles)) fout.push("Deze tekst belooft iets wat ZekerFlex niet kan waarmaken (verzekerd, gegarandeerd, direct uitbetaald). Haal die belofte weg.");
  return fout;
}
