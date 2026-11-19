// ---------------------------------------------------------------------------
// Advertentie op maat (/advertentie-op-maat): de regels, puur (geen kv, prisma,
// zod of mail), zodat het formulier in de browser en de tests ze ook gebruiken.
//
// Een bedrijf vult een paar dingen in en ziet meteen zes ontwerpen van zijn
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
  { nr: 4, naam: "Poster", uitleg: "Donker, schuine kop" },
  { nr: 5, naam: "Diagonaal", uitleg: "Twee kleurvlakken" },
  { nr: 6, naam: "Redactie", uitleg: "Schreef en veel wit" },
] as const;
export type OntwerpNr = 1 | 2 | 3 | 4 | 5 | 6;
export const isOntwerpNr = (v: unknown): v is OntwerpNr => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= ONTWERPEN.length;

export const FORMATEN = {
  vierkant: { breedte: 1080, hoogte: 1080, naam: "Vierkant", maat: "1080 × 1080" },
  verhaal: { breedte: 1080, hoogte: 1920, naam: "Verhaal", maat: "1080 × 1920" },
  liggend: { breedte: 1200, hoogte: 628, naam: "Liggend", maat: "1200 × 628" },
} as const;
export type FormaatId = keyof typeof FORMATEN;
export const FORMAAT_IDS = Object.keys(FORMATEN) as FormaatId[];
export const isFormaatId = (v: unknown): v is FormaatId => typeof v === "string" && Object.hasOwn(FORMATEN, v);

/** Het voorbeeld vóór vrijgave: klein, de langste zijde hooguit zoveel beeldpunten. */
export const VOORBEELD_ZIJDE = 600;
/** De kleine schone maat voor de lijst in Beheer (alleen voor een platformbeheerder). */
export const BEHEER_KLEIN = 360;
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
  /** alleen dat ene ontwerp, of alle ontwerpen */
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
/** Alles wat vóór dit moment voor het laatst gewijzigd is, is verlopen (voor de dagelijkse opruiming, lib/privacy/sweep.ts). */
export const verloopGrens = (nu: Date): Date => new Date(nu.getTime() - BEWAAR_DAGEN * 86_400_000);

/**
 * Vrijgeven hoort bij de aanvraag die de beheerder zag. Heeft de klant intussen opnieuw "Deze wil ik" ingestuurd (ander
 * ontwerp, ander pakket), dan is het tijdstip van de aanvraag anders en gaat het vrijgeven niet door.
 */
export const KEUZE_GEWIJZIGD = { code: "KEUZE_GEWIJZIGD", tekst: "De klant heeft zijn keuze gewijzigd. Bekijk de aanvraag opnieuw." } as const;
export const keuzeGewijzigd = (aanvraag: { op: string } | undefined, gezienOp: string): boolean => !aanvraag || aanvraag.op !== gezienOp;

// ---------------------------------------------------------------------------
// Invoer schoonmaken
// ---------------------------------------------------------------------------

/**
 * De tekens die in ALLE lettertypes van de beelden zitten (public/fonts/advertentie; uit de cmap van de zeven TTF's
 * gelezen, tests/advertentie-op-maat.test.ts controleert dat). Al het andere gaat eruit: een teken dat ontbreekt geeft een
 * leeg blokje, en next/og zou er anders zelf een lettertype voor bij Google gaan ophalen.
 */
export const IN_LETTERTYPE =
  /[\u{20}-\u{7E}\u{A1}-\u{A3}\u{A5}\u{A7}-\u{AB}\u{AE}-\u{B0}\u{B4}\u{B6}-\u{B8}\u{BA}\u{BB}\u{BF}-\u{107}\u{10A}-\u{113}\u{116}-\u{11B}\u{11E}-\u{123}\u{126}\u{127}\u{12A}\u{12B}\u{12E}-\u{133}\u{136}\u{137}\u{139}-\u{13E}\u{141}-\u{148}\u{14A}-\u{14D}\u{150}-\u{15B}\u{15E}-\u{161}\u{164}\u{165}\u{16A}-\u{17E}\u{20AC}]/u;
const NIET_IN_LETTERTYPE = new RegExp(IN_LETTERTYPE.source.replace("[", "[^"), "gu");

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
    .replace(/\u{B1}/gu, "+/-")
    .replace(/\u{BD}/gu, "1/2")
    .replace(NIET_IN_LETTERTYPE, "")
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
  if (!isOntwerpNr(ontwerp)) return { ok: false, fout: "Kies eerst een van de ontwerpen.", veld: "ontwerp" };
  if (pakket !== "een" && pakket !== "alle") return { ok: false, fout: "Kies of je dit ene ontwerp wilt of alle ontwerpen.", veld: "pakket" };
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
  "review", "reviews", "klanten", "sterren", "ervaring", "procent", "direct", "meteen", "helft", "halve", "half", "dubbel", "dubbele", "tweede", "derde",
  "dagelijks", "specialist", "specialisten", "expert", "experts", "vakman", "vakmensen", "uniek", "unieke", "enige", "origineel", "originele", "officieel", "officiële",
];
/** Het begin van een woord volstaat ("kortingen", "goedkoopste", "gegarandeerd", "kosteloze"). */
const CLAIM_STAMMEN = [
  "korting", "gratis", "kostelo", "goedkoop", "voordel", "aanbieding", "garan", "gegarandeerd", "keurmerk", "gecertific", "grootste", "snelste", "laagste",
  "bekroond", "winnaar", "award", "bezorg", "lever", "specialis",
];
/** Een telwoord vlak voor "halen", "betalen", "gratis" of "voor" is een aanbieding ("twee halen, één betalen", "drie voor twee"). */
const TELWOORD = "(?:een|één|twee|drie|vier|vijf|zes|zeven|acht|negen|tien)";
const AANBIEDING = new RegExp(`(?:^|[^a-z\\u{E0}-\\u{17F}])${TELWOORD}\\s+(?:halen|betalen|gratis|kado|cadeau|voor\\s+${TELWOORD})(?![a-z\\u{E0}-\\u{17F}])`, "u");

const getallen = (tekst: string): Set<string> => new Set(tekst.match(/\d+/g) ?? []);

/**
 * Staat er in de tekst iets wat het bedrijf niet zelf invulde? Elk getal (als heel getal: "5" staat niet in "2015"),
 * %, € en elk claimwoord moet in de invoer van het bedrijf voorkomen. De contactregel telt daarbij niet mee: een
 * telefoonnummer bevat bijna elk cijfer en een webadres bijna elk woord. Liever een keer te streng (dan komt het
 * sjabloon) dan een verzonnen korting in iemands advertentie.
 */
export function verzint(tekst: string, i: Invoer): boolean {
  const bron = [i.bedrijf, i.aanbod, i.plaats ?? "", i.boodschap ?? ""].join(" ").toLowerCase();
  const t = tekst.toLowerCase();
  const eigen = getallen(bron);
  for (const getal of getallen(t)) if (!eigen.has(getal)) return true;
  for (const teken of ["%", "€", "*"]) if (t.includes(teken) && !bron.includes(teken)) return true;
  const aanbieding = AANBIEDING.exec(t)?.[0].replace(/^[^a-z\u{E0}-\u{17F}]+/u, "");
  if (aanbieding && !bron.includes(aanbieding)) return true;
  const woorden = t.split(/[^a-z\u{E0}-\u{17F}]+/u).filter(Boolean);
  const eigenWoorden = new Set(bron.split(/[^a-z\u{E0}-\u{17F}]+/u).filter(Boolean));
  if (CLAIM_WOORDEN.some((w) => woorden.includes(w) && !eigenWoorden.has(w))) return true;
  return CLAIM_STAMMEN.some((s) => woorden.some((w) => w.startsWith(s)) && ![...eigenWoorden].some((w) => w.startsWith(s)));
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

/** Is dit ontwerp van deze advertentie vrijgegeven? Bij "één ontwerp" alleen het gekozen ontwerp, bij "alle ontwerpen" allemaal. */
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
 * De enige plek die bepaalt wat de beeldroute teruggeeft. Niet vrijgegeven = altijd het watermerk en altijd
 * klein, wat er ook gevraagd wordt: een browser kan een schermafbeelding niet tegenhouden, dus de schone versie mag de
 * browser vóór vrijgave nooit bereiken. Na vrijgave zijn alleen de gekozen ontwerpen schoon (ontwerpVrij). Alleen een
 * platformbeheerder ziet de schone versie eerder (voor de controle in Beheer).
 */
export function beeldBesluit(v: { ad: Pick<Advertentie, "status" | "aanvraag">; ontwerp: OntwerpNr; beheerder: boolean; formaat: FormaatId }): BeeldBesluit {
  if (v.beheerder || ontwerpVrij(v.ad, v.ontwerp)) {
    const f = FORMATEN[v.formaat];
    return { watermerk: false, formaat: v.formaat, breedte: f.breedte, hoogte: f.hoogte };
  }
  // het voorbeeld: klein en met watermerk, in het gevraagde formaat (zo ziet de klant ook het verhaal en de liggende
  // versie, in een telefoon of als poster); de langste zijde is nooit groter dan het voorbeeld
  const f = FORMATEN[v.formaat];
  const schaal = VOORBEELD_ZIJDE / Math.max(f.breedte, f.hoogte);
  return { watermerk: true, formaat: v.formaat, breedte: Math.round(f.breedte * schaal), hoogte: Math.round(f.hoogte * schaal) };
}

// ---------------------------------------------------------------------------
// De prijs: één bron voor de site, de FAQ, de resultaatpagina, Beheer en de mail
// ---------------------------------------------------------------------------

export const PAKKETTEN = ["een", "alle"] as const;
export type Pakket = (typeof PAKKETTEN)[number];
export const isPakket = (v: unknown): v is Pakket => v === "een" || v === "alle";

/** De prijs per pakket van de advertentie op maat, en van de logo maker (lib/logo). */
export type Prijzen = Record<Pakket | "logo", string>;

/** De vaste prijzen (door de eigenaar bepaald, 19 nov 2026), exclusief btw. Beheer kan ze overschrijven; leeg = deze. */
export const STANDAARD_PRIJZEN: Prijzen = { een: "€ 29", alle: "€ 49", logo: "€ 49" };
export const BTW_TEKST = "excl. btw";

export const PAKKET_NAAM: Record<Pakket, string> = { een: "Eén ontwerp", alle: "Alle ontwerpen" };
export const PAKKET_UITLEG: Record<Pakket, string> = {
  een: "Het ontwerp dat je kiest, zonder watermerk, in drie formaten.",
  alle: "Alle zes de ontwerpen, zonder watermerk, elk in drie formaten.",
};

export const PRIJS_MAX = 12;
export const PRIJS_FOUT = "Vul alleen een bedrag in, bijvoorbeeld 29 of 29,50. Laat het veld leeg voor de standaardprijs.";

/**
 * Een prijs uit Beheer: alleen een bedrag ("29", "29,50", "€ 29"), altijd opgeslagen als "€ 29" of "€ 29,50". Leeg = ""
 * (de standaard geldt). Iets anders (tekst, "gratis", "vanaf") = null: de route weigert het met een 422.
 */
export function normaliseerPrijs(v: unknown): string | null {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return "";
  const m = /^(?:€\s*)?(\d{1,5})(?:[.,](\d{1,2}))?$/.exec(t.slice(0, PRIJS_MAX));
  if (!m || t.length > PRIJS_MAX) return null;
  const euro = String(Number(m[1]));
  const cent = m[2] === undefined ? "" : m[2].padEnd(2, "0");
  if (euro === "0" && (cent === "" || cent === "00")) return null;
  return cent === "" || cent === "00" ? `€ ${euro}` : `€ ${euro},${cent}`;
}

/** De prijzen die gelden: wat de eigenaar in Beheer invulde, en anders de standaard (ook als er iets onbruikbaars staat). */
export function geldendePrijzen(ingesteld: unknown): Prijzen {
  const kies = (naam: Pakket | "logo") => normaliseerPrijs(veld(ingesteld, naam)) || STANDAARD_PRIJZEN[naam];
  return { een: kies("een"), alle: kies("alle"), logo: kies("logo") };
}

/** "€ 29 excl. btw" */
export const prijsTekst = (prijzen: Prijzen, pakket: Pakket | "logo"): string => `${prijzen[pakket]} ${BTW_TEKST}`;
/** Voor het aanbod en de kop: "Vanaf € 29" */
export const vanafTekst = (prijzen: Prijzen = STANDAARD_PRIJZEN): string => `Vanaf ${prijzen.een}`;
