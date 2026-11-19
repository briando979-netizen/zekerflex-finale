// ---------------------------------------------------------------------------
// Advertentie op maat (/advertentie-op-maat): de regels, puur (geen kv, prisma,
// zod of mail), zodat het formulier in de browser en de tests ze ook gebruiken.
//
// Een bedrijf vult een paar dingen in en ziet meteen drie ontwerpen van zijn
// eigen advertentie. Het voorbeeld is klein en heeft een ingebakken watermerk;
// de schone, grote versie bestaat pas na vrijgave door de eigenaar (na betaling).
// Die beslissing staat hier op één plek: beeldBesluit().
// ---------------------------------------------------------------------------

/** De kleurstalen van het formulier. Elke kleur is donker genoeg voor witte tekst of krijgt die via lib/rijschool/kleuren.ts. */
export const KLEUREN = [
  { id: "groen", naam: "Groen", hex: "#0E5C4A" },
  { id: "blauw", naam: "Blauw", hex: "#1D4E89" },
  { id: "rood", naam: "Rood", hex: "#B3261E" },
  { id: "oranje", naam: "Oranje", hex: "#E8590C" },
  { id: "paars", naam: "Paars", hex: "#5B3A9B" },
  { id: "antraciet", naam: "Antraciet", hex: "#1F2933" },
] as const;

export type KleurId = (typeof KLEUREN)[number]["id"];
export const STANDAARD_KLEUR: KleurId = "groen";

export const isKleurId = (v: unknown): v is KleurId => typeof v === "string" && KLEUREN.some((k) => k.id === v);
export const kleurHex = (id: KleurId): string => KLEUREN.find((k) => k.id === id)?.hex ?? KLEUREN[0].hex;

/** De langste invoer per veld (tekens). Het formulier toont dezelfde grenzen. */
export const GRENS = {
  bedrijf: 60,
  aanbod: 200,
  plaats: 40,
  boodschap: 80,
  contact: 60,
  kop: 64,
  onderregel: 130,
  knop: 24,
  naam: 80,
  email: 200,
  telefoon: 30,
} as const;

export const ONTWERPEN = [
  { nr: 1, naam: "Strak", uitleg: "Donker en rustig" },
  { nr: 2, naam: "Licht", uitleg: "Licht en speels" },
  { nr: 3, naam: "Groot", uitleg: "Grote letters" },
] as const;
export type OntwerpNr = 1 | 2 | 3;
export const isOntwerpNr = (v: unknown): v is OntwerpNr => v === 1 || v === 2 || v === 3;

export const FORMATEN = {
  vierkant: { breedte: 1080, hoogte: 1080, naam: "Vierkant", maat: "1080 × 1080" },
  verhaal: { breedte: 1080, hoogte: 1920, naam: "Verhaal", maat: "1080 × 1920" },
  liggend: { breedte: 1200, hoogte: 628, naam: "Liggend", maat: "1200 × 628" },
} as const;
export type FormaatId = keyof typeof FORMATEN;
export const FORMAAT_IDS = Object.keys(FORMATEN) as FormaatId[];
export const isFormaatId = (v: unknown): v is FormaatId => typeof v === "string" && Object.hasOwn(FORMATEN, v);

/** Het voorbeeld vóór vrijgave: alleen vierkant en klein. */
export const VOORBEELD_ZIJDE = 600;
export const WATERMERK_TEKST = "VOORBEELD · zekerflex.com";

export interface Invoer {
  bedrijf: string;
  aanbod: string;
  plaats?: string;
  boodschap?: string;
  contact?: string;
  kleur: KleurId;
}

export interface AdTekst {
  kop: string;
  onderregel: string;
  knop: string;
}

export type Status = "gemaakt" | "aangevraagd" | "vrijgegeven";

export interface Aanvraag {
  /** het ontwerp dat de klant aanklikte */
  ontwerp: OntwerpNr;
  /** alleen dat ene ontwerp, of alle drie */
  pakket: "een" | "alle";
  naam: string;
  email: string;
  telefoon?: string;
  /** ISO-tijd (UTC) */
  op: string;
}

export interface Advertentie {
  id: string;
  aangemaakt: string;
  gewijzigd: string;
  invoer: Invoer;
  tekst: AdTekst;
  /** kwam de tekst van het taalmodel of uit het vaste sjabloon */
  bron: "model" | "sjabloon";
  status: Status;
  aanvraag?: Aanvraag;
  vrijgegevenOp?: string;
}

/** Het id is het bewijs (capability): 128 bit uit crypto, als 32 hex-tekens. */
export const isAdvertentieId = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{32}$/.test(v);

/** Een advertentie vervalt 60 dagen na de laatste wijziging (maken, aanvragen, vrijgeven). */
export const BEWAAR_DAGEN = 60;
export function verlopen(gewijzigd: string, nu: Date): boolean {
  const t = Date.parse(gewijzigd);
  return !Number.isFinite(t) || nu.getTime() - t > BEWAAR_DAGEN * 86_400_000;
}

// ---------------------------------------------------------------------------
// Invoer schoonmaken
// ---------------------------------------------------------------------------

/**
 * Maakt van wat dan ook één nette regel tekst: geen HTML, geen stuurtekens of onzichtbare tekens, alleen letters en
 * leestekens die in de lettertypes van de advertentie zitten (Latijns, met accenten; geen emoji), en hooguit `max` tekens.
 */
export function schoonTekst(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const s = v
    .normalize("NFC")
    .replace(/\p{Cf}/gu, "")
    .replace(/[\p{Cc}\u{A0}\u{2028}\u{2029}]/gu, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/[\u{2018}\u{2019}\u{201A}\u{2032}]/gu, "'")
    .replace(/[\u{201C}\u{201D}\u{201E}\u{2033}]/gu, '"')
    .replace(/[\u{2010}-\u{2015}\u{2212}]/gu, "-")
    .replace(/\u{2026}/gu, "...")
    .replace(/\u{2022}/gu, "\u{B7}")
    .replace(/[^\u{20}-\u{7E}\u{A1}-\u{17F}\u{20AC}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.slice(0, max).trim();
}

/** Kort een tekst af op een woordgrens, zonder half woord aan het eind. */
export function kortAf(tekst: string, max: number): string {
  if (tekst.length <= max) return tekst;
  const stuk = tekst.slice(0, max + 1);
  const spatie = stuk.lastIndexOf(" ");
  const kort = (spatie > max * 0.5 ? stuk.slice(0, spatie) : tekst.slice(0, max)).trim();
  return kort.replace(/[\s,;:·-]+$/, "");
}

export type Uitkomst<T> = { ok: true; waarde: T } | { ok: false; fout: string; veld: string };

const veld = (bron: unknown, naam: string): unknown => (bron && typeof bron === "object" ? (bron as Record<string, unknown>)[naam] : undefined);

/** De invoer van het formulier, schoon en begrensd. Lege keuzevelden vallen weg. */
export function valideerInvoer(ruw: unknown): Uitkomst<Invoer> {
  const bedrijf = schoonTekst(veld(ruw, "bedrijf"), GRENS.bedrijf);
  const aanbod = schoonTekst(veld(ruw, "aanbod"), GRENS.aanbod);
  const plaats = schoonTekst(veld(ruw, "plaats"), GRENS.plaats);
  const boodschap = schoonTekst(veld(ruw, "boodschap"), GRENS.boodschap);
  const contact = schoonTekst(veld(ruw, "contact"), GRENS.contact);
  const kleur = veld(ruw, "kleur");
  if (bedrijf.length < 2) return { ok: false, fout: "Vul de naam van je bedrijf in.", veld: "bedrijf" };
  if (aanbod.length < 5) return { ok: false, fout: "Vertel in een of twee zinnen wat je aanbiedt.", veld: "aanbod" };
  return {
    ok: true,
    waarde: {
      bedrijf,
      aanbod,
      ...(plaats ? { plaats } : {}),
      ...(boodschap ? { boodschap } : {}),
      ...(contact ? { contact } : {}),
      kleur: isKleurId(kleur) ? kleur : STANDAARD_KLEUR,
    },
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** "Deze wil ik": het gekozen ontwerp en wie we mogen benaderen. */
export function valideerAanvraag(ruw: unknown): Uitkomst<Omit<Aanvraag, "op">> {
  const ontwerp = Number(veld(ruw, "ontwerp"));
  const naam = schoonTekst(veld(ruw, "naam"), GRENS.naam);
  const emailRuw = veld(ruw, "email");
  const email = typeof emailRuw === "string" ? emailRuw.trim().slice(0, GRENS.email) : "";
  const telefoon = schoonTekst(veld(ruw, "telefoon"), GRENS.telefoon).replace(/[^0-9+() -]/g, "").trim();
  const pakket = veld(ruw, "pakket");
  if (!isOntwerpNr(ontwerp)) return { ok: false, fout: "Kies eerst een van de drie ontwerpen.", veld: "ontwerp" };
  if (pakket !== "een" && pakket !== "alle") return { ok: false, fout: "Kies of je dit ene ontwerp wilt of alle drie.", veld: "pakket" };
  if (naam.length < 2) return { ok: false, fout: "Vul je naam in.", veld: "naam" };
  if (!EMAIL.test(email)) return { ok: false, fout: "Vul een geldig e-mailadres in.", veld: "email" };
  return { ok: true, waarde: { ontwerp, pakket, naam, email, ...(telefoon ? { telefoon } : {}) } };
}

// ---------------------------------------------------------------------------
// De tekst van de advertentie
// ---------------------------------------------------------------------------

/** Is de contactregel een telefoonnummer (en geen website)? */
export const isTelefoon = (contact: string): boolean => /^[0-9+() -]{6,}$/.test(contact);

const eersteZin = (tekst: string): string => {
  const m = /^(.+?[.!?])(?:\s|$)/.exec(tekst);
  return (m?.[1] ?? tekst).trim();
};

/**
 * De tekst zonder taalmodel: alleen woorden van het bedrijf zelf, plus een paar vaste verbindingswoorden. Dit werkt altijd,
 * ook als het model stil is of iets onbruikbaars teruggeeft.
 */
export function sjabloonTekst(i: Invoer): AdTekst {
  const aanbod = eersteZin(i.aanbod).replace(/[.]+$/, "");
  const waar = i.plaats ? `${i.bedrijf} in ${i.plaats}` : i.bedrijf;
  const kop = kortAf(i.boodschap ?? aanbod, GRENS.kop);
  const onderregel = kortAf(i.boodschap ? i.aanbod : `Bij ${waar}`, GRENS.onderregel);
  const knop = !i.contact ? "Neem contact op" : isTelefoon(i.contact) ? "Bel ons" : "Bekijk de website";
  return { kop, onderregel, knop };
}

/** Woorden die een belofte of claim zijn: alleen toegestaan als het bedrijf ze zelf invulde. */
const CLAIM_WOORDEN = [
  "beste", "actie", "acties", "jaar", "jaren", "nummer", "sinds", "altijd", "nooit", "euro", "iedereen", "vandaag", "morgen", "erkend", "erkende",
  "review", "reviews", "klanten", "sterren", "ervaring", "procent", "direct", "meteen",
];
/** Het begin van een woord volstaat ("kortingen", "goedkoopste", "gegarandeerd"). */
const CLAIM_STAMMEN = [
  "korting", "gratis", "goedkoop", "voordel", "aanbieding", "garan", "gegarandeerd", "keurmerk", "gecertific", "grootste", "snelste", "laagste",
  "bekroond", "winnaar", "award", "bezorg", "lever",
];

/**
 * Staat er in de tekst iets wat het bedrijf niet zelf invulde? Elk cijfer, %, € en elk claimwoord moet letterlijk in de
 * invoer voorkomen. Liever een keer te streng (dan komt het sjabloon) dan een verzonnen korting in iemands advertentie.
 */
export function verzint(tekst: string, i: Invoer): boolean {
  const bron = [i.bedrijf, i.aanbod, i.plaats ?? "", i.boodschap ?? "", i.contact ?? ""].join(" ").toLowerCase();
  const t = tekst.toLowerCase();
  for (const getal of t.match(/\d+/g) ?? []) if (!bron.includes(getal)) return true;
  for (const teken of ["%", "€", "*"]) if (t.includes(teken) && !bron.includes(teken)) return true;
  const woorden = t.split(/[^a-z\u{E0}-\u{17F}]+/u).filter(Boolean);
  if (CLAIM_WOORDEN.some((w) => woorden.includes(w) && !bron.includes(w))) return true;
  return CLAIM_STAMMEN.some((s) => woorden.some((w) => w.startsWith(s)) && !bron.includes(s));
}

/** Tekst die geen tekst is, toch leesbaar maken (een model geeft soms een object of een lijst waar tekst hoort). */
function alsTekst(v: unknown, diepte = 0): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (!v || typeof v !== "object" || diepte > 2) return "";
  const delen = (Array.isArray(v) ? v : Object.values(v)).map((x) => alsTekst(x, diepte + 1)).filter(Boolean);
  return Array.isArray(v) ? delen.join(" ") : (delen[0] ?? "");
}

const eerste = (bron: unknown, namen: string[]): unknown => {
  for (const n of namen) {
    const v = veld(bron, n);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
};

/**
 * Leest het antwoord van het taalmodel soepel. Per veld: schoonmaken, afkorten, en bij een leeg of verzonnen veld de
 * tekst uit het sjabloon. Is geen enkel veld van het model bruikbaar, dan is de bron "sjabloon".
 */
export function leesModelTekst(antwoord: unknown, i: Invoer): { tekst: AdTekst; bron: "model" | "sjabloon" } {
  const vast = sjabloonTekst(i);
  const bron = Array.isArray(antwoord) ? antwoord[0] : (eerste(antwoord, ["advertentie", "tekst", "ad"]) ?? antwoord);
  const basis = bron && typeof bron === "object" ? bron : antwoord;
  let vanModel = 0;
  const kies = (namen: string[], max: number, min: number, terugval: string): string => {
    const t = kortAf(schoonTekst(alsTekst(eerste(basis, namen)), max * 3), max).replace(/^["']+|["']+$/g, "").trim();
    if (t.length < min || verzint(t, i)) return terugval;
    vanModel++;
    return t;
  };
  const tekst: AdTekst = {
    kop: kies(["kop", "headline", "titel", "title"], GRENS.kop, 3, vast.kop),
    onderregel: kies(["onderregel", "subheadline", "subkop", "ondertitel", "sub"], GRENS.onderregel, 3, vast.onderregel),
    knop: kies(["knop", "knoptekst", "cta", "button"], GRENS.knop, 2, vast.knop),
  };
  // de kop is het hart van de advertentie: zonder kop van het model is het gewoon het sjabloon
  return vanModel > 0 && tekst.kop !== vast.kop ? { tekst, bron: "model" } : { tekst: vast, bron: "sjabloon" };
}

// ---------------------------------------------------------------------------
// Het beeld: watermerk ja of nee, en welke maat
// ---------------------------------------------------------------------------

/** Is dit ontwerp van deze advertentie vrijgegeven? Bij "één ontwerp" alleen het gekozen ontwerp, bij "alle drie" allemaal. */
export function ontwerpVrij(ad: Pick<Advertentie, "status" | "aanvraag">, ontwerp: OntwerpNr): boolean {
  if (ad.status !== "vrijgegeven" || !ad.aanvraag) return false;
  return ad.aanvraag.pakket === "alle" || ad.aanvraag.ontwerp === ontwerp;
}

export interface BeeldBesluit {
  watermerk: boolean;
  formaat: FormaatId;
  breedte: number;
  hoogte: number;
}

/**
 * De enige plek die bepaalt wat de beeldroute teruggeeft. Niet vrijgegeven = altijd het watermerk, altijd vierkant en
 * klein, wat er ook gevraagd wordt: een browser kan een schermafbeelding niet tegenhouden, dus de schone versie mag de
 * browser vóór vrijgave nooit bereiken. Na vrijgave zijn alleen de gekozen ontwerpen schoon (ontwerpVrij). Alleen een
 * platformbeheerder ziet de schone versie eerder (voor de controle in Beheer).
 */
export function beeldBesluit(v: { ad: Pick<Advertentie, "status" | "aanvraag">; ontwerp: OntwerpNr; beheerder: boolean; formaat: FormaatId }): BeeldBesluit {
  if (v.beheerder || ontwerpVrij(v.ad, v.ontwerp)) {
    const f = FORMATEN[v.formaat];
    return { watermerk: false, formaat: v.formaat, breedte: f.breedte, hoogte: f.hoogte };
  }
  return { watermerk: true, formaat: "vierkant", breedte: VOORBEELD_ZIJDE, hoogte: VOORBEELD_ZIJDE };
}

// ---------------------------------------------------------------------------
// De prijs: één bron voor de site, de FAQ, de resultaatpagina, Beheer en de mail
// ---------------------------------------------------------------------------

export const PAKKETTEN = ["een", "alle"] as const;
export type Pakket = (typeof PAKKETTEN)[number];
export const isPakket = (v: unknown): v is Pakket => v === "een" || v === "alle";

export type Prijzen = Record<Pakket, string>;

/** De vaste prijzen (door de eigenaar bepaald, 19 nov 2026), exclusief btw. Beheer kan ze overschrijven; leeg = deze. */
export const STANDAARD_PRIJZEN: Prijzen = { een: "€ 29", alle: "€ 49" };
export const BTW_TEKST = "excl. btw";

export const PAKKET_NAAM: Record<Pakket, string> = { een: "Eén ontwerp", alle: "Alle drie de ontwerpen" };
export const PAKKET_UITLEG: Record<Pakket, string> = {
  een: "Het ontwerp dat je kiest, zonder watermerk, in drie formaten.",
  alle: "Alle drie de ontwerpen, zonder watermerk, elk in drie formaten.",
};

export const PRIJS_MAX = 20;
export const schonePrijs = (v: unknown): string => schoonTekst(v, PRIJS_MAX);

/** De prijzen die gelden: wat de eigenaar in Beheer invulde, en anders de standaard. */
export function geldendePrijzen(ingesteld: unknown): Prijzen {
  const een = schonePrijs(veld(ingesteld, "een"));
  const alle = schonePrijs(veld(ingesteld, "alle"));
  return { een: een || STANDAARD_PRIJZEN.een, alle: alle || STANDAARD_PRIJZEN.alle };
}

/** "€ 29 excl. btw" */
export const prijsTekst = (prijzen: Prijzen, pakket: Pakket): string => `${prijzen[pakket]} ${BTW_TEKST}`;
/** Voor het aanbod en de kop: "Vanaf € 29" */
export const vanafTekst = (prijzen: Prijzen = STANDAARD_PRIJZEN): string => `Vanaf ${prijzen.een}`;
