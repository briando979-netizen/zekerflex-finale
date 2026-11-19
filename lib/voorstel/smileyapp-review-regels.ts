import { gemiddelde } from "@/lib/voorstel/review-weergave";
import { isDatum } from "@/lib/voorstel/smileyapp-blog-regels";

// ---------------------------------------------------------------------------
// Reviews die het SmileyApp-team zelf invoert (19 nov 2026, deel 4). Geen
// koppeling met Google of een betaalde dienst: iemand van het team neemt een
// review die het echt kreeg over in het beheer, met de bron erbij, en de site
// zet erbij dat SmileyApp ze zelf heeft overgenomen. Er staat hier dus geen
// enkele review: zonder zichtbare review bestaat het blok op de site niet.
// Dit bestand is puur: de regels, het gemiddelde, wat de site toont en de
// Nederlandse teksten. De opslag staat in lib/voorstel/smileyapp-reviews.ts.
// ---------------------------------------------------------------------------

export const REVIEWS_MAX = 60;
/** Zoveel kaarten toont de site hooguit; het gemiddelde telt wel alle zichtbare reviews. */
export const REVIEWS_GETOOND = 6;
export const NAAM_MIN = 2;
export const NAAM_MAX = 60;
export const ORGANISATIE_MAX = 80;
export const TEKST_MIN = 20;
export const TEKST_MAX = 600;
export const LINK_MAX = 300;

export const REVIEW_BRONNEN = ["Google", "Trustpilot", "E-mail", "Anders"] as const;
export type ReviewBron = (typeof REVIEW_BRONNEN)[number];
export const isReviewBron = (b: unknown): b is ReviewBron => typeof b === "string" && (REVIEW_BRONNEN as readonly string[]).includes(b);
export const isReviewId = (id: unknown): id is string => typeof id === "string" && /^[a-f0-9]{16}$/.test(id);

/** Een review zoals hij in de opslag staat. */
export interface Review {
  id: string;
  /** zoals het team hem wil tonen: de naam die de schrijver zelf gebruikte */
  naam: string;
  /** organisatie of functie */
  organisatie?: string;
  /** geheel getal van 1 tot en met 5 */
  sterren: number;
  tekst: string;
  bron: ReviewBron;
  /** alleen https */
  bronLink?: string;
  /** de dag van de review zelf, JJJJ-MM-DD */
  datum?: string;
  zichtbaar: boolean;
  aangemaakt: string;
  /** het teamlid dat de review het laatst bewaarde */
  door?: string;
}

/** Wat het formulier in het beheer instuurt. Lege tekst = niet ingevuld. */
export interface ReviewInvoer {
  naam: string;
  organisatie: string;
  sterren: number;
  tekst: string;
  bron: string;
  bronLink: string;
  datum: string;
  zichtbaar: boolean;
}

export type ReviewWaarde = Pick<Review, "naam" | "organisatie" | "sterren" | "tekst" | "bron" | "bronLink" | "datum" | "zichtbaar">;
export type ReviewControle = { ok: true; waarde: ReviewWaarde } | { ok: false; veld: keyof ReviewInvoer; fout: string };

/** Een link naar de bron: alleen https, met een gewone hostnaam en zonder inloggegevens. Geeft het adres terug, of null. */
export function leesBronLink(tekst: string): string | null {
  const t = tekst.trim();
  if (!t || t.length > LINK_MAX || /\s/.test(t) || !/^https:\/\//i.test(t)) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" || u.username || u.password || !u.hostname.includes(".")) return null;
    return u.href.length > LINK_MAX ? null : u.href;
  } catch {
    return null;
  }
}

/** `vandaag`: de Nederlandse dag van nu (JJJJ-MM-DD); een review van morgen bestaat niet. */
export function valideerReview(i: ReviewInvoer, vandaag: string): ReviewControle {
  const fout = (veld: keyof ReviewInvoer, tekst: string): ReviewControle => ({ ok: false, veld, fout: tekst });
  const naam = i.naam.replace(/\s+/g, " ").trim();
  const organisatie = i.organisatie.replace(/\s+/g, " ").trim();
  const tekst = i.tekst
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const datum = i.datum.trim();
  if (naam.length < NAAM_MIN) return fout("naam", `Vul de naam in van wie de review schreef (minstens ${NAAM_MIN} tekens).`);
  if (naam.length > NAAM_MAX) return fout("naam", `De naam mag hooguit ${NAAM_MAX} tekens zijn.`);
  if (organisatie.length > ORGANISATIE_MAX) return fout("organisatie", `De organisatie of functie mag hooguit ${ORGANISATIE_MAX} tekens zijn.`);
  if (!Number.isInteger(i.sterren) || i.sterren < 1 || i.sterren > 5) return fout("sterren", "Kies 1 tot en met 5 sterren.");
  if (tekst.length < TEKST_MIN) return fout("tekst", `Neem de tekst van de review over (minstens ${TEKST_MIN} tekens).`);
  if (tekst.length > TEKST_MAX) return fout("tekst", `De tekst mag hooguit ${TEKST_MAX} tekens zijn.`);
  if (!isReviewBron(i.bron)) return fout("bron", "Kies waar de review vandaan komt.");
  let bronLink: string | undefined;
  if (i.bronLink.trim()) {
    if (i.bronLink.trim().length > LINK_MAX) return fout("bronLink", `De link mag hooguit ${LINK_MAX} tekens zijn.`);
    const link = leesBronLink(i.bronLink);
    if (!link) return fout("bronLink", "De link naar de bron moet met https:// beginnen.");
    bronLink = link;
  }
  if (datum) {
    if (!isDatum(datum)) return fout("datum", "Kies een geldige datum.");
    if (datum > vandaag) return fout("datum", "De datum van de review kan niet in de toekomst liggen.");
  }
  // lege velden komen niet als lege tekst in de opslag
  return { ok: true, waarde: { naam, ...(organisatie ? { organisatie } : {}), sterren: i.sterren, tekst, bron: i.bron, ...(bronLink ? { bronLink } : {}), ...(datum ? { datum } : {}), zichtbaar: i.zichtbaar === true } };
}

/** Een rij uit de opslag die klopt; een kapotte rij haalt de site niet onderuit maar telt niet mee. */
export function isReview(r: unknown): r is Review {
  if (r === null || typeof r !== "object") return false;
  const x = r as Record<string, unknown>;
  return (
    isReviewId(x.id) &&
    typeof x.naam === "string" &&
    x.naam.trim().length >= NAAM_MIN &&
    typeof x.tekst === "string" &&
    x.tekst.trim().length > 0 &&
    typeof x.sterren === "number" &&
    Number.isInteger(x.sterren) &&
    x.sterren >= 1 &&
    x.sterren <= 5 &&
    isReviewBron(x.bron) &&
    typeof x.zichtbaar === "boolean" &&
    typeof x.aangemaakt === "string" &&
    (x.organisatie === undefined || typeof x.organisatie === "string") &&
    (x.bronLink === undefined || (typeof x.bronLink === "string" && leesBronLink(x.bronLink) !== null)) &&
    (x.datum === undefined || (typeof x.datum === "string" && isDatum(x.datum)))
  );
}

/** Het formulier gevuld met een bestaande review. */
export const alsReviewInvoer = (r: Review): ReviewInvoer => ({
  naam: r.naam,
  organisatie: r.organisatie ?? "",
  sterren: r.sterren,
  tekst: r.tekst,
  bron: r.bron,
  bronLink: r.bronLink ?? "",
  datum: r.datum ?? "",
  zichtbaar: r.zichtbaar,
});

export interface ReviewOverzicht {
  /** over alle zichtbare reviews, op één decimaal */
  gemiddelde: number;
  /** het aantal zichtbare reviews */
  aantal: number;
  /** hooguit REVIEWS_GETOOND kaarten, nieuwste review eerst */
  getoond: Review[];
}

/** De dag waarop een review sorteert: zijn eigen datum, anders de dag waarop hij is ingevoerd. */
const sorteerDag = (r: Review) => r.datum ?? r.aangemaakt.slice(0, 10);

/**
 * Wat de site toont. Geen zichtbare review = null: dan bestaat het blok niet (geen kop, geen lege sterren).
 * Gemiddelde en aantal tellen alleen de zichtbare reviews.
 */
export function reviewOverzicht(alle: readonly Review[]): ReviewOverzicht | null {
  const zichtbaar = alle.filter((r) => r.zichtbaar);
  const cijfer = gemiddelde(zichtbaar.map((r) => ({ score: r.sterren })));
  if (zichtbaar.length === 0 || cijfer === null) return null;
  const getoond = [...zichtbaar].sort((a, b) => (sorteerDag(a) === sorteerDag(b) ? (a.aangemaakt < b.aangemaakt ? 1 : -1) : sorteerDag(a) < sorteerDag(b) ? 1 : -1)).slice(0, REVIEWS_GETOOND);
  return { gemiddelde: cijfer, aantal: zichtbaar.length, getoond };
}

// ---- teksten van het blok op de site -----------------------------------------

export type ReviewTaal = "nl" | "en" | "de";

/** De teksten van het blok; Engels en Duits staan in lib/voorstel/smileyapp-talen.ts (zelfde sleutels). */
export interface ReviewTeksten {
  boven: string;
  kop: string;
  /** met {gemiddelde} en {aantal} */
  samenvatting: string;
  /** bij precies één review, met {gemiddelde} */
  samenvattingEen: string;
  /** bij een kaart, voor schermlezers, met {n} */
  sterren: string;
  /** met {bron} */
  bron: string;
  /** linktekst, met {bron} */
  bronLink: string;
  nieuwVenster: string;
  voet: string;
  /** hoe een bron in een zin heet */
  bronnen: Record<ReviewBron, string>;
}

export const REVIEWS_NL: ReviewTeksten = {
  boven: "Reviews",
  kop: "Wat klanten zeggen",
  samenvatting: "{gemiddelde} van 5 sterren uit {aantal} reviews",
  samenvattingEen: "{gemiddelde} van 5 sterren uit 1 review",
  sterren: "{n} van 5 sterren",
  bron: "Bron: {bron}",
  bronLink: "Bekijk de review bij de bron ({bron})",
  nieuwVenster: "(opent een nieuw tabblad)",
  voet: "Reviews door Smileyapp zelf overgenomen uit de genoemde bron.",
  bronnen: { Google: "Google", Trustpilot: "Trustpilot", "E-mail": "e-mail", Anders: "andere bron" },
};

/** 4.6 → "4,6" (Nederlands en Duits) of "4.6" (Engels); altijd één decimaal. */
export const cijferTekst = (n: number, taal: ReviewTaal = "nl") => (taal === "en" ? n.toFixed(1) : n.toFixed(1).replace(".", ","));

const vulIn = (tekst: string, waarden: Record<string, string | number>) => tekst.replace(/\{(\w+)\}/g, (heel, naam: string) => (Object.hasOwn(waarden, naam) ? String(waarden[naam]) : heel));

/** "4,6 van 5 sterren uit 12 reviews": de tekst naast de sterren. */
export const samenvattingTekst = (o: Pick<ReviewOverzicht, "gemiddelde" | "aantal">, t: ReviewTeksten = REVIEWS_NL, taal: ReviewTaal = "nl") =>
  vulIn(o.aantal === 1 ? t.samenvattingEen : t.samenvatting, { gemiddelde: cijferTekst(o.gemiddelde, taal), aantal: o.aantal });

export const sterrenTekst = (n: number, t: ReviewTeksten = REVIEWS_NL) => vulIn(t.sterren, { n });
export const bronTekst = (bron: ReviewBron, t: ReviewTeksten = REVIEWS_NL) => vulIn(t.bron, { bron: t.bronnen[bron] });
export const bronLinkTekst = (bron: ReviewBron, t: ReviewTeksten = REVIEWS_NL) => vulIn(t.bronLink, { bron: t.bronnen[bron] });

const MAANDEN: Record<ReviewTaal, readonly string[]> = {
  nl: ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  de: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
};

/** "3 november 2026", "3 November 2026" of "3. November 2026": een vaste dag zonder tijd, dus de tijdzone speelt geen rol. */
export function reviewDatum(iso: string, taal: ReviewTaal = "nl"): string {
  if (!isDatum(iso)) return "";
  const [j, m, d] = iso.split("-").map(Number);
  return `${d ?? ""}${taal === "de" ? "." : ""} ${MAANDEN[taal][(m ?? 1) - 1] ?? ""} ${j ?? ""}`;
}

/** Hoeveel procent van de vijf sterren gevuld is, voor de balk met sterren (versiering; de tekst ernaast zegt het cijfer). */
export const sterrenBreedte = (cijfer: number) => Math.max(0, Math.min(100, Math.round((cijfer / 5) * 100)));
