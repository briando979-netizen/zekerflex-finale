// ---------------------------------------------------------------------------
// De partnervoorwaarden voor uitzendbureaus (21 nov 2026, eigenaar: "maak duidelijke dingen op papier voor de
// uitzendbureaus en regels en boetes en beleid"). De bedragen en termijnen staan hier op één plek: de openbare pagina
// /uitzendpartner/voorwaarden, de pagina /uitzendpartner en de schakelaar in het beheer lezen ze hieruit.
// Wijzig je de voorwaarden inhoudelijk, verhoog dan VERSIE: een bureau moet de nieuwe versie opnieuw accepteren.
// Puur bestand: ook in de browser.
// ---------------------------------------------------------------------------

export const PARTNER_VOORWAARDEN_VERSIE = "2026-11";
export const PARTNER_VOORWAARDEN_DATUM = "21 november 2026";
export const PARTNER_VOORWAARDEN_PAD = "/uitzendpartner/voorwaarden";

/** Termijnen (werkdagen of dagen, zoals in de naam) */
export const TERMIJN = {
  /** reageren op een aanvraag van een werker (ja of nee) */
  reactieWerkdagen: 2,
  /** uren goedkeuren; daarna gelden ze als definitief (zoals artikel 5 van de gebruiksvoorwaarden) */
  urenDagen: 7,
  /** de platformfactuur betalen */
  betaalDagen: 14,
  /** gegevens van een werker zonder contract verwijderen */
  gegevensWeken: 4,
  /** een datalek met gegevens van werkers melden aan ZekerFlex */
  datalekUren: 48,
  /** een vervallen eis (keurmerk, registratie, verzekering) melden */
  wijzigingWerkdagen: 5,
  /** herstellen na een waarschuwing */
  herstelWerkdagen: 5,
  /** bezwaar maken tegen een maatregel */
  bezwaarDagen: 14,
  /** ZekerFlex beslist op een bezwaar */
  beslisWerkdagen: 10,
  /** schorsing bij niet reageren */
  schorsingDagen: 14,
  /** omzeiling: werkers die het bureau via ZekerFlex leerde kennen */
  omzeilingMaanden: 6,
  /** opzeggen door het bureau */
  opzegMaanden: 1,
  /** wijziging van de voorwaarden vooraf melden */
  wijzigingVoorwaardenDagen: 30,
} as const;

/** Boetes in euro (hele bedragen, geen btw: een boete is geen vergoeding voor een dienst) */
export const BOETE = {
  /** een nepklus of een klus met een misleidend loon of misleidende omschrijving, bij herhaling binnen 12 maanden, per klus */
  misleidendeKlus: 250,
  /** omzeiling: als de gewerkte uren niet vast te stellen zijn, per werker */
  omzeilingPerWerker: 500,
  /** loon aan een werker niet of meer dan 7 dagen te laat betaald, per werker per keer */
  loonTeLaat: 250,
  /** gegevens van werkers misbruikt (doorverkocht, voor iets anders gebruikt, niet verwijderd), per overtreding */
  gegevensMisbruik: 2500,
  /** klussen geplaatst zonder geldige registratie of toelating als uitlener */
  zonderToelating: 2500,
} as const;

/** Aansprakelijkheid van ZekerFlex: ten hoogste dit bedrag per kalenderjaar (en nooit meer dan 12 maanden platformvergoeding) */
export const AANSPRAKELIJKHEID_MAX_EURO = 5000;

export const euroBedrag =(euro: number): string => `€ ${euro.toLocaleString("nl-NL")}`;
