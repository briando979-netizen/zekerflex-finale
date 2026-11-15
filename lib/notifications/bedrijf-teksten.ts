// ---------------------------------------------------------------------------
// De vaste zinnen van de meldingen in de bel voor een BEDRIJF (lib/notifications/feed.ts, app "werkgever"), in de twee talen
// van de werkgeversapp (15 nov 2026). Tot nu toe stonden ze alleen in het Nederlands in feed.ts. De Nederlandse zinnen zijn
// precies die van toen: ze zijn de basis van de handtekening waarmee een weggeklikte melding wordt onthouden
// (lib/notifications/dismissed.ts), dus laat ze zoals ze zijn. Vrije tekst (naam, dienst) staat er als plaatshouder in.
// Puur en zonder imports.
// ---------------------------------------------------------------------------

export const MELDING_BEDRIJF_NL = {
  tegenbodTitel: "Nieuw tegenbod",
  tegenbodBody: "{naam} biedt € {tarief}/u voor {dienst}.",
  reactieTitel: "Nieuwe reactie",
  reactieBody: "{naam} wil {dienst} doen. Kies voor de klus begint.",
  urenEen: "{n} urenbriefje te keuren",
  urenMeer: "{n} urenbriefjes te keuren",
  urenBody: "Keur goed zodat je krachten hun uitbetaling in gang kunnen zetten.",
  nietVolTitel: "Dienst nog niet vol",
  nietVolBody: "{dienst}: {vrij} plek(ken) open, start over {uren} uur.",
};

export type MeldingBedrijfTeksten = typeof MELDING_BEDRIJF_NL;

export const MELDING_BEDRIJF_EN: MeldingBedrijfTeksten = {
  tegenbodTitel: "New counter-offer",
  tegenbodBody: "{naam} offers € {tarief}/h for {dienst}.",
  reactieTitel: "New response",
  reactieBody: "{naam} wants to do {dienst}. Choose before the shift starts.",
  urenEen: "{n} timesheet to approve",
  urenMeer: "{n} timesheets to approve",
  urenBody: "Approve them so your workers' payment can get started.",
  nietVolTitel: "Shift not full yet",
  nietVolBody: "{dienst}: {vrij} place(s) open, starts in {uren} hours.",
};

/** De bedrijfszinnen in de taal van de werkgeversapp: Engels als die op Engels staat, anders Nederlands. */
export const meldingBedrijfVoor = (locale: string): MeldingBedrijfTeksten => (locale === "en" ? MELDING_BEDRIJF_EN : MELDING_BEDRIJF_NL);
