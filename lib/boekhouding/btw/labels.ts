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
  formaat: 1;
  jaar: number;
  kwartaal: number;
  van: string;
  tot: string;
  rubrieken: BtwRubriekRij[];
  verschuldigdCents: number;
  voorbelastingCents: number;
  saldoCents: number;
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

export const STATUS_TEKST: Readonly<Record<string, string>> = {
  BEREKEND: "Concept",
  GOEDGEKEURD: "Klaar om in te dienen",
  INGEDIEND: "Ingediend",
  VERVANGEN: "Vervangen door een nieuwere versie",
};
