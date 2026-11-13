// ---------------------------------------------------------------------------
// De bouwer: "Schrijf met AI" bij een blok met een kop en een tekst (13 nov 2026, eigenaar: "een AI-assistent zoals de grote
// websitebouwers"). Wat het model krijgt, hoe we zijn antwoord soepel lezen en welke getallen de eigenaar moet nalopen.
// Puur en veilig voor de browser (geen zod, geen AI): de aanroep zelf staat in lib/sites/bloktekst-ai.ts.
// Het model krijgt alleen wat de ondernemer zelf invulde en mag niets verzinnen; er wordt niets opgeslagen: de ondernemer
// ziet het voorstel en kiest zelf of hij het gebruikt.
// ---------------------------------------------------------------------------

export const KOP_MAX = 80;
export const TEKST_MAX = 600;
export const WENS_MAX = 300;

export interface BlokTekstInvoer {
  /** de naam van het soort blok, zoals de bouwer die toont ("Openingsblok met foto") */
  soort: string;
  bedrijf: string;
  plaats: string;
  kop: string;
  tekst: string;
  /** wat de ondernemer erbij vraagt ("korter", "voor jonge gezinnen"); mag leeg */
  wens: string;
}

export interface BlokTekst {
  kop: string;
  tekst: string;
}

export function blokTekstInvoer(v: Partial<Record<keyof BlokTekstInvoer, unknown>>): BlokTekstInvoer {
  const s = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");
  return { soort: s(v.soort, 60), bedrijf: s(v.bedrijf, 100), plaats: s(v.plaats, 80), kop: s(v.kop, 160), tekst: typeof v.tekst === "string" ? v.tekst.trim().slice(0, 2000) : "", wens: s(v.wens, WENS_MAX) };
}

export const BLOKTEKST_SYSTEEM = `Je schrijft tekst voor de website van een Nederlandse ondernemer. Schrijf in gewoon, vlot Nederlands (B1-niveau), zonder Engels en zonder opsmuk of grote woorden.
Regels:
- Gebruik ALLEEN de gegevens die je krijgt. Verzin niets: geen jaartallen, aantallen klanten, prijzen, kortingen, keurmerken, garanties, prijzen die gewonnen zijn, openingstijden, adressen of namen van mensen.
- Heeft de ondernemer al tekst geschreven, neem de feiten daaruit over en maak alleen de zinnen beter.
- Weet je weinig, schrijf dan kort en algemeen. Liever kort dan verzonnen.
- Vraagt de ondernemer iets erbij (zijn wens), volg dat, maar verzin er nog steeds geen feiten bij.
Schrijf:
- "kop": een korte kop van hooguit 60 tekens, zonder punt aan het eind.
- "tekst": 2 tot 4 korte zinnen, samen hooguit 450 tekens. Geen opsommingstekens, kopjes of opmaak.
Antwoord uitsluitend met JSON: {"kop": "...", "tekst": "..."}`;

/** Het bericht met de gegevens; lege velden laten we weg, zodat het model ze ook niet "invult". */
export function blokTekstVraag(i: BlokTekstInvoer): string {
  const gegevens: Record<string, string> = {};
  if (i.soort) gegevens.soortBlok = i.soort;
  if (i.bedrijf) gegevens.bedrijf = i.bedrijf;
  if (i.plaats) gegevens.plaats = i.plaats;
  if (i.kop) gegevens.huidigeKop = i.kop;
  if (i.tekst) gegevens.huidigeTekst = i.tekst;
  if (i.wens) gegevens.wensVanDeOndernemer = i.wens;
  return `Schrijf de kop en de tekst voor dit blok van de website. Dit is alles wat we weten:\n${JSON.stringify(gegevens, null, 2)}`;
}

/** Tekst die geen tekst is (een lijst, een object, een getal) toch leesbaar maken. */
function alsTekst(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(alsTekst).filter(Boolean).join("\n\n");
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).map(alsTekst).filter(Boolean).join("\n\n");
  return "";
}

/** Opmaak die een model soms toch meestuurt (vet, kopjes, opsommingstekens, aanhalingstekens, HTML) eruit. */
function schoon(s: string): string {
  return s
    .replace(/```[a-z]*\n?|```/gi, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\*\*|__/g, "")
    .split("\n")
    .map((r) =>
      r
        .replace(/^\s*#{1,6}\s*/, "")
        .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^["'“”„]+|["'“”„]+$/g, "")
    .trim();
}

/** Afknippen op een woordgrens, zonder half woord of losse komma aan het eind. */
function knip(s: string, max: number): string {
  if (s.length <= max) return s;
  const deel = s.slice(0, max);
  const spatie = deel.lastIndexOf(" ");
  return (spatie > max * 0.6 ? deel.slice(0, spatie) : deel).replace(/[\s,;:–-]+$/, "");
}

/**
 * Leest het antwoord van het model. Soepel: een model levert soms een object of een lijst waar tekst hoort, of andere
 * sleutels. Geeft null als er geen bruikbare tekst in zit.
 */
export function leesBlokTekst(raw: unknown): BlokTekst | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const kop = knip(schoon(alsTekst(o.kop ?? o.titel ?? o.title ?? o.heading)).replace(/\n+/g, " ").replace(/\.$/, ""), KOP_MAX);
  const tekst = knip(schoon(alsTekst(o.tekst ?? o.text ?? o.omschrijving ?? o.body)), TEKST_MAX);
  if (tekst.length < 10) return null;
  return { kop, tekst };
}

/** Getallen in het voorstel die de ondernemer niet zelf noemde: die moet hij nalopen (een model verzint ze graag). */
export function getallenTeControleren(uit: BlokTekst, i: BlokTekstInvoer): string[] {
  const bekend = `${i.kop} ${i.tekst} ${i.wens} ${i.bedrijf} ${i.plaats}`;
  const gevonden = `${uit.kop} ${uit.tekst}`.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return [...new Set(gevonden)].filter((g) => !bekend.includes(g));
}
