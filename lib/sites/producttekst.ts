import type { SiteProduct } from "@/lib/sites/types";
import { euro } from "@/lib/sites/winkel";
import { KORTE_OMSCHRIJVING } from "@/lib/sites/winkel-check";

// ---------------------------------------------------------------------------
// Studio → Webshop → Slim → Producttekst schrijven: wat het model krijgt, hoe we
// zijn antwoord soepel lezen en welke woorden de eigenaar moet nalopen. Puur en
// client-veilig (geen zod, geen AI): het scherm controleert de tekst ook terwijl
// de eigenaar hem aanpast. De AI-aanroep zelf: lib/sites/producttekst-ai.ts.
// De korte zin is ook de beschrijving onder het product in Google (lib/sites/render.ts);
// de titel in Google is vast de productnaam met de bedrijfsnaam erachter.
// ---------------------------------------------------------------------------

/** Zo lang mag de korte zin zijn: daarna knipt Google (en de site) hem af. */
export const KORTE_TEKST_MAX = 160;
/** Een omschrijving van de AI houden we kort; de eigenaar kan altijd meer schrijven (het veld zelf mag 4000). */
export const OMSCHRIJVING_MAX = 1200;

/** Zoveel producten schrijft de AI per keer ("alle producten zonder goede tekst"). */
export const MAX_PER_RONDE = 20;

/** De producten die een (betere) tekst kunnen gebruiken: zonder korte zin of met (bijna) geen omschrijving; die online staan eerst. */
export function zonderGoedeTekst(producten: SiteProduct[]): SiteProduct[] {
  const mist = producten.filter((p) => p.naam.trim() && (p.omschrijving.trim().length < KORTE_OMSCHRIJVING || !p.korteTekst.trim()));
  return [...mist.filter((p) => p.zichtbaar), ...mist.filter((p) => !p.zichtbaar)];
}

export interface ProductTekst {
  korteTekst: string;
  omschrijving: string;
}

/** Wat het model over een product te horen krijgt: alleen wat de eigenaar zelf invulde. */
export interface ProductTekstInvoer {
  naam: string;
  categorie: string;
  keuzes: { naam: string; waarden: string[] }[];
  prijs: string;
  bedrijf: string;
  huidigeKorteTekst: string;
  huidigeOmschrijving: string;
}

export function productTekstInvoer(p: SiteProduct, bedrijfNaam: string): ProductTekstInvoer {
  return {
    naam: p.naam.trim().slice(0, 120),
    categorie: p.categorie.trim().slice(0, 60),
    keuzes: (p.opties ?? []).map((o) => ({ naam: o.naam.slice(0, 30), waarden: o.waarden.slice(0, 20).map((w) => w.slice(0, 40)) })),
    prijs: p.prijsCents > 0 ? euro(p.prijsCents) : "",
    bedrijf: bedrijfNaam.trim().slice(0, 100),
    huidigeKorteTekst: p.korteTekst.trim().slice(0, 200),
    huidigeOmschrijving: p.omschrijving.trim().slice(0, 2000),
  };
}

export const PRODUCTTEKST_SYSTEEM = `Je schrijft producttekst voor de webshop van een Nederlandse ondernemer. Schrijf in gewoon, vlot Nederlands (B1-niveau), zonder Engels, zonder opsmuk en zonder grote woorden als "de beste", "uniek" of "perfect".
Regels:
- Gebruik ALLEEN de gegevens die je krijgt. Verzin niets: geen materialen, stoffen, ingrediënten, allergenen, maten, afmetingen, gewichten, herkomst, garanties, keurmerken, levertijden, kortingen, aantallen of gezondheidsclaims die er niet in staan.
- Staan er keuzes bij (zoals maten of kleuren), dan mag je zeggen dat de klant daaruit kiest; noem alleen die waarden.
- Noem de prijs niet: die staat al op de pagina en kan veranderen.
- Heeft de ondernemer al tekst geschreven, neem de feiten daaruit over en maak alleen de zinnen beter.
- Weet je weinig, schrijf dan kort en algemeen op basis van de naam en de categorie. Liever kort dan verzonnen.
Schrijf:
- "korteTekst": één zin van hooguit 150 tekens. Die staat op de productkaart en onder het product in Google.
- "omschrijving": 2 tot 4 korte zinnen, eventueel in twee alinea's (gescheiden door een lege regel), samen hooguit 600 tekens. Geen opsommingstekens, kopjes of opmaak.
Antwoord uitsluitend met JSON: {"korteTekst": "...", "omschrijving": "..."}`;

/** Het bericht met de productgegevens; lege velden laten we weg, zodat het model ze ook niet "invult". */
export function productTekstVraag(i: ProductTekstInvoer): string {
  const gegevens: Record<string, unknown> = { product: i.naam };
  if (i.categorie) gegevens.categorie = i.categorie;
  if (i.keuzes.length) gegevens.keuzes = i.keuzes;
  if (i.prijs) gegevens.prijs = i.prijs;
  if (i.bedrijf) gegevens.winkel = i.bedrijf;
  if (i.huidigeKorteTekst) gegevens.huidigeKorteZin = i.huidigeKorteTekst;
  if (i.huidigeOmschrijving) gegevens.huidigeOmschrijving = i.huidigeOmschrijving;
  return `Schrijf de teksten voor dit product. Dit is alles wat we erover weten:\n${JSON.stringify(gegevens, null, 2)}`;
}

/** Tekst die geen tekst is (een lijst, een object, een getal) toch leesbaar maken. */
function alsTekst(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(alsTekst).filter(Boolean).join("\n\n");
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).map(alsTekst).filter(Boolean).join("\n\n");
  return "";
}

/** Opmaak die een model soms toch meestuurt (vet, kopjes, opsommingstekens, aanhalingstekens) eruit. */
function schoon(s: string): string {
  return s
    .replace(/```[a-z]*\n?|```/gi, "")
    .replace(/\*\*|__/g, "")
    .split("\n")
    .map((r) =>
      r
        .replace(/^\s*#{1,6}\s*/, "")
        .replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")
        .trim(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(/^["'“”„]+|["'“”„]+$/g, "")
    .trim();
}

/** Afknippen op een woordgrens, zonder half woord of losse komma aan het eind. */
export function knipOpWoord(s: string, max: number): string {
  if (s.length <= max) return s;
  const stuk = s.slice(0, max + 1);
  const spatie = stuk.lastIndexOf(" ");
  return (spatie > max * 0.6 ? stuk.slice(0, spatie) : s.slice(0, max)).replace(/[\s,;:–-]+$/, "");
}

/** Een omschrijving afknippen op een alinea of zin, anders op een woord. */
function knipOmschrijving(s: string, max: number): string {
  if (s.length <= max) return s;
  const stuk = s.slice(0, max);
  const grens = Math.max(stuk.lastIndexOf("\n\n"), stuk.lastIndexOf(". "), stuk.lastIndexOf("! "), stuk.lastIndexOf("? "));
  return grens > max * 0.5 ? stuk.slice(0, grens + 1).trim() : knipOpWoord(s, max);
}

const KORT = ["korteTekst", "korte_tekst", "kortetekst", "korteZin", "korte_zin", "kort", "zin", "tagline", "slogan", "short", "shortDescription", "metaDescription", "seoOmschrijving"];
const LANG = ["omschrijving", "beschrijving", "productOmschrijving", "description", "tekst", "text", "body"];

function pak(o: Record<string, unknown>, namen: string[]): string {
  const lager = new Map(Object.entries(o).map(([k, v]) => [k.toLowerCase(), v]));
  for (const n of namen) {
    const v = lager.get(n.toLowerCase());
    const t = schoon(alsTekst(v));
    if (t) return t;
  }
  return "";
}

/**
 * Het antwoord van het model soepel lezen (zoals lib/orchestration/antwoord.ts): een lijst, een
 * object in een object, een omschrijving als lijst van alinea's, opmaak en te lange tekst kunnen
 * allemaal. Zonder bruikbare omschrijving: null. Zonder korte zin: de eerste zin van de omschrijving.
 */
export function leesProductTekst(ruw: unknown): ProductTekst | null {
  let o: unknown = Array.isArray(ruw) ? ruw[0] : ruw;
  // alleen een losse tekst: dat is dan de omschrijving
  if (typeof o === "string") o = { omschrijving: o };
  if (o && typeof o === "object" && !pak(o as Record<string, unknown>, LANG)) {
    const binnen = Object.values(o as Record<string, unknown>).find((v) => v && typeof v === "object" && !Array.isArray(v) && pak(v as Record<string, unknown>, LANG));
    if (binnen) o = binnen;
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const omschrijving = knipOmschrijving(pak(r, LANG), OMSCHRIJVING_MAX);
  if (omschrijving.length < 20) return null;
  const eersteZin = /^[^\n.!?]*[.!?]?/.exec(omschrijving)?.[0] ?? "";
  const korteTekst = knipOpWoord((pak(r, KORT) || eersteZin).replace(/\s+/g, " ").trim(), KORTE_TEKST_MAX);
  return { korteTekst, omschrijving };
}

// Woorden die een feit beloven dat een klant kan nagaan. Staan ze niet in de gegevens van de
// eigenaar, dan kan de AI ze verzonnen hebben: de eigenaar loopt ze na voordat hij opslaat.
const FEITWOORDEN = [
  "garantie", "gegarandeerd", "keurmerk", "gecertificeerd", "certificaat", "biologisch", "biologische", "ecologisch", "duurzaam", "duurzame", "vegan", "vegetarisch",
  "handgemaakt", "handgemaakte", "ambachtelijk", "ambachtelijke", "katoen", "katoenen", "linnen", "wol", "wollen", "leer", "leren", "leder", "zijde", "polyester", "hout", "houten", "eiken", "bamboe",
  "rvs", "roestvrij", "roestvrijstaal", "staal", "stalen", "aluminium", "glas", "glazen", "keramiek", "porselein", "waterdicht", "waterafstotend", "vaatwasserbestendig", "vaatwasser",
  "glutenvrij", "lactosevrij", "suikervrij", "allergenen", "noten", "gratis", "levertijd", "verzending", "bezorging", "morgen", "vandaag", "korting", "nederlands", "nederlandse", "italiaans", "italiaanse",
];

/**
 * Wat de eigenaar moet nalopen: getallen (maten, procenten, jaren) en feitwoorden (materiaal,
 * garantie, keurmerk) die wel in de tekst staan maar niet in zijn eigen gegevens. Geen oordeel,
 * alleen een lijst om te controleren.
 */
export function teControleren(tekst: ProductTekst, invoer: ProductTekstInvoer): string[] {
  const bron = [invoer.naam, invoer.categorie, invoer.prijs, invoer.bedrijf, invoer.huidigeKorteTekst, invoer.huidigeOmschrijving, ...invoer.keuzes.flatMap((k) => [k.naam, ...k.waarden])].join(" ").toLowerCase();
  const bronWoorden = new Set(bron.split(/[^a-z0-9à-ÿ]+/).filter(Boolean));
  const bronGetallen = new Set((bron.match(/\d+(?:[.,]\d+)?/g) ?? []).map((g) => g.replace(",", ".")));
  const doel = `${tekst.korteTekst}\n${tekst.omschrijving}`;
  const uit: string[] = [];
  const zet = (s: string) => {
    const t = s.trim();
    if (t && !uit.some((u) => u.toLowerCase() === t.toLowerCase())) uit.push(t);
  };
  for (const m of doel.matchAll(/(\d+(?:[.,]\d+)?)\s*(%|[A-Za-zÀ-ÿ]+)?/g)) {
    if (!bronGetallen.has((m[1] ?? "").replace(",", "."))) zet(m[0]);
  }
  const doelWoorden = doel.toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter(Boolean);
  for (const w of doelWoorden) if (FEITWOORDEN.includes(w) && !bronWoorden.has(w)) zet(w);
  return uit.slice(0, 8);
}
