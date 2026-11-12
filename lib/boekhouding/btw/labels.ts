// ---------------------------------------------------------------------------
// Btw-concept: namen, uitleg en vormen die het scherm en de berekening delen (puur, zonder imports, dus veilig in de
// browser). De rubrieknummers en teksten zijn een werkbaar startpunt: DOOR ACCOUNTANT TE BEVESTIGEN.
// ---------------------------------------------------------------------------

export type MeldingErnst = "blokkeert" | "let-op" | "info";

export interface MeldingVerwijzing {
  /** boeking-id's, zonder namen (hooguit 25) */
  boekingen: string[];
  /** bon-id's, zonder namen (hooguit 25) */
  bonnen: string[];
  /** hoeveel het er in totaal zijn */
  aantal: number;
}

export interface BtwMelding {
  /** stabiele sleutel, bv. "BON_ZONDER_BOEKING" */
  code: string;
  ernst: MeldingErnst;
  /** gewoon Nederlands: wat er aan de hand is en wat je nog moet doen */
  tekst: string;
  verwijzing: MeldingVerwijzing;
}

export interface BtwRubriekRij {
  rubriek: string;
  label: string;
  uitleg: string;
  /** null bij rubrieken zonder grondslag (5a, 5b, 5c) */
  grondslagCents: number | null;
  /** de grondslag zoals die in de aangifte staat: hele euro's, afgerond (zie btw/kern.ts) */
  grondslagEuro: number | null;
  btwCents: number;
  /**
   * De btw zoals die in het aangifteformulier staat: hele euro's, afgerond volgens rondBtwAf. Ontbreekt in momentopnames
   * van voor deze afronding; vul hem dan soepel aan met rubriekenMetHeleEuros.
   */
  btwHeleEuros?: number;
  doorAccountantTeBevestigen: boolean;
  /** korte reden, alleen als doorAccountantTeBevestigen waar is */
  reden?: string;
}

export interface Voorbehoud {
  onderwerp: string;
  reden: string;
}

export interface BtwConceptInhoud {
  /** vorm van deze momentopname; bij een andere opbouw gaat dit getal omhoog */
  formaat: 1 | 2;
  jaar: number;
  kwartaal: number;
  van: string;
  tot: string;
  rubrieken: BtwRubriekRij[];
  verschuldigdCents: number;
  voorbelastingCents: number;
  saldoCents: number;
  /** 5a, 5b en 5c in hele euro's (alleen vanaf formaat 2; 5c = 5a minus 5b) */
  verschuldigdHeleEuros?: number;
  voorbelastingHeleEuros?: number;
  saldoHeleEuros?: number;
  voorbehouden: Voorbehoud[];
  meldingen: BtwMelding[];
}

/** Een bewaarde versie van het concept zoals het scherm hem krijgt. */
export interface BtwConceptRij {
  id: string;
  administratieId: string;
  jaar: number;
  kwartaal: number;
  versie: number;
  status: "BEREKEND" | "GOEDGEKEURD" | "INGEDIEND" | "VERVANGEN";
  statusTekst: string;
  berekendOp: string;
  goedgekeurdOp: string | null;
  ingediendOp: string | null;
  indieningReferentie: string | null;
  /** laatste dag voor indienen, "2026-04-30" */
  deadline: string | null;
  saldoCents: number;
  inhoud: BtwConceptInhoud;
}

/** De volgorde en namen van de rubrieken in het scherm en de CSV. */
export const RUBRIEK_VOLGORDE = ["1a", "1b", "1c", "1d", "1e", "2a", "3a", "3b", "3c", "4a", "4b", "5a", "5b", "5c"] as const;

export const RUBRIEK_TEKST: Readonly<Record<string, { label: string; uitleg: string }>> = {
  "1a": { label: "Leveringen en diensten, hoog tarief (21%)", uitleg: "Wat je aan klanten in rekening bracht met 21% btw." },
  "1b": { label: "Leveringen en diensten, laag tarief (9%)", uitleg: "Wat je aan klanten in rekening bracht met 9% btw." },
  "1c": { label: "Overige tarieven", uitleg: "Leveringen en diensten met een ander tarief dan 21% of 9%." },
  "1d": { label: "Privégebruik", uitleg: "Btw over spullen of diensten die je voor privé hebt gebruikt." },
  "1e": { label: "Verkopen zonder btw (0% of niet belast)", uitleg: "Omzet waar je geen btw over rekent. Alleen het omzetbedrag telt, er is geen btw." },
  "2a": { label: "Btw verlegd naar jou (binnen Nederland)", uitleg: "Je afnemer of leverancier draagt de btw af, niet jij of juist wel jij." },
  "3a": { label: "Leveringen naar landen buiten de EU", uitleg: "Export van goederen. Er is geen btw." },
  "3b": { label: "Leveringen en diensten aan bedrijven in de EU", uitleg: "Verkopen aan EU-bedrijven zonder btw. Hier hoort ook de opgaaf ICP bij." },
  "3c": { label: "Installatie en afstandsverkopen binnen de EU", uitleg: "Speciale gevallen van verkoop binnen de EU." },
  "4a": { label: "Inkoop van buiten de EU", uitleg: "Je kocht iets van buiten de EU en draagt de btw zelf af." },
  "4b": { label: "Inkoop uit de EU", uitleg: "Je kocht iets uit een EU-land en draagt de btw zelf af." },
  "5a": { label: "Btw die je moet afdragen", uitleg: "Alle btw die je verschuldigd bent: 1a t/m 1d, 2a, 4a en 4b bij elkaar." },
  "5b": { label: "Btw die je terugkrijgt (voorbelasting)", uitleg: "De btw op wat je inkocht en zakelijk gebruikt." },
  "5c": { label: "Saldo: te betalen of terug te vragen", uitleg: "Rubriek 5a min 5b. Een positief bedrag betaal je, een negatief bedrag krijg je terug." },
};

/** Rubrieken waar een grondslag (omzetbedrag) in kan staan. */
export const GRONDSLAG_RUBRIEKEN: readonly string[] = ["1a", "1b", "1c", "1d", "1e", "2a", "3a", "3b", "3c", "4a", "4b"];
/** Rubrieken waar verschuldigde btw in kan staan (tel mee in 5a). */
export const VERSCHULDIGD_RUBRIEKEN: readonly string[] = ["1a", "1b", "1c", "1d", "2a", "4a", "4b"];
/** Voorbelasting. */
export const VOORBELASTING_RUBRIEK = "5b";

const geenMinNul = (n: number): number => (n === 0 ? 0 : n);

/**
 * De afrondingsregel voor de btw op het aangifteformulier (daar zijn alle bedragen hele euro's): altijd in het EIGEN
 * VOORDEEL van de ondernemer. Te betalen btw (1a t/m 1d, 2a, 4a, 4b en 5a) gaat naar beneden (630 ct wordt 6 euro, -630 ct
 * wordt -7 euro), de voorbelasting in 5b naar boven (630 ct wordt 7 euro, -630 ct wordt -6 euro). Rubrieken zonder btw
 * (1e, 3a, 3b, 3c) hebben geen btw en blijven 0. 5c is geen eigen afronding maar 5a minus 5b (saldoInHeleEuros).
 * Of dit zo mag, bevestigt een accountant: de rubrieken blijven doorAccountantTeBevestigen.
 */
export function rondBtwAf(rubriek: string, centen: number): number {
  if (VERSCHULDIGD_RUBRIEKEN.includes(rubriek) || rubriek === "5a") return geenMinNul(Math.floor(centen / 100));
  if (rubriek === VOORBELASTING_RUBRIEK) return geenMinNul(Math.ceil(centen / 100));
  return geenMinNul(Math.trunc(centen / 100));
}

/** 5c in hele euro's: het afgeronde 5a min het afgeronde 5b, zodat het formulier optelt. */
export const saldoInHeleEuros = (verschuldigdHeleEuros: number, voorbelastingHeleEuros: number): number => geenMinNul(verschuldigdHeleEuros - voorbelastingHeleEuros);

/**
 * Vult btwHeleEuros aan op rijen uit een oude momentopname (zonder dat veld) en maakt 5a en 5c kloppend: 5a is de som van
 * de afgeronde rubrieken die erin tellen, 5c is 5a min 5b. Een bewaarde waarde blijft staan (behalve 5a en 5c, die volgen).
 */
export function rubriekenMetHeleEuros(rijen: readonly BtwRubriekRij[]): (BtwRubriekRij & { btwHeleEuros: number })[] {
  const eerst = rijen.map((r) => ({ ...r, btwHeleEuros: r.btwHeleEuros ?? rondBtwAf(r.rubriek, r.btwCents) }));
  const som = eerst.filter((r) => VERSCHULDIGD_RUBRIEKEN.includes(r.rubriek)).reduce((s, r) => s + r.btwHeleEuros, 0);
  const vb = eerst.find((r) => r.rubriek === VOORBELASTING_RUBRIEK)?.btwHeleEuros ?? 0;
  return eerst.map((r) => {
    if (r.rubriek === "5a") return { ...r, btwHeleEuros: geenMinNul(som) };
    if (r.rubriek === "5c") return { ...r, btwHeleEuros: saldoInHeleEuros(som, vb) };
    return r;
  });
}

export const STATUS_TEKST: Readonly<Record<string, string>> = {
  BEREKEND: "Concept",
  GOEDGEKEURD: "Klaar om in te dienen",
  INGEDIEND: "Ingediend",
  VERVANGEN: "Vervangen door een nieuwere versie",
};
