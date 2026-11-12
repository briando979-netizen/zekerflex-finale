// ---------------------------------------------------------------------------
// De vaste zinnen van de meldingen in de bel voor een WERKER (lib/notifications/feed.ts), Nederlands: de bron. De andere
// talen (EN/PL/RO/UK) staan in lib/i18n/freelancer.ts onder `meldingTeksten` met dezelfde vorm. Vrije tekst van een mens (de
// naam van een klus, een chatbericht, een gespreksonderwerp) staat er als plaatshouder in en wordt nooit vertaald.
// Puur en zonder imports. De Nederlandse tekst is de standaard én de basis van de handtekening waarmee een weggeklikte
// melding wordt onthouden (lib/notifications/dismissed.ts): een zin hier wijzigen laat weggeklikte meldingen terugkomen,
// dus laat de Nederlandse zinnen zoals ze zijn.
// Opdrachtgevers en beheer houden de Nederlandse meldingen, zonder deze teksten.
// ---------------------------------------------------------------------------

export const MELDING_NL = {
  /** taalcode voor bedragen */
  intl: "nl-NL",
  chatNieuw: "Nieuw bericht",
  chatEen: '{n} nieuw bericht: "{tekst}"',
  chatMeer: '{n} nieuw berichten: "{tekst}"',
  bevestigTitel: "Bevestig je komst",
  bevestigBody: "{klus} bij {bedrijf} — over {uren} uur",
  bevestigKnop: "Bevestig komst",
  urenDisputTitel: "Dispuut over je uren",
  urenDisputBody: "Er is een dispuut over een urenbriefje.",
  urenWachtTitel: "Uren in behandeling",
  urenWachtBody: "Je ingediende uren wachten op goedkeuring.",
  tegenbodOkTitel: "Tegenbod geaccepteerd",
  tegenbodOkBody: "{klus}: je tarief van € {tarief}/u is akkoord. Je staat ingepland.",
  uitgekozenTitel: "Je bent uitgekozen",
  uitgekozenBody: "{klus}: je reactie is geaccepteerd. Je staat ingepland.",
  tegenbodNeeTitel: "Tegenbod afgewezen",
  tegenbodNeeBody: "{klus}: het oorspronkelijke tarief blijft gelden.",
  nietUitgekozenTitel: "Niet uitgekozen",
  nietUitgekozenBody: "{klus}: er is iemand anders gekozen. Zoek een andere klus.",
  helaasTitel: "Helaas niet uitgekozen",
  helaasBody: "{klus}: de klus is begonnen zonder dat je gekozen bent. Zoek een andere klus.",
  matchTitel: "Niet uitgekozen",
  matchBody: "{klus}: deze klus is niet (meer) voor jou — een ander is gekozen of de reactietijd is verlopen.",
  vervangerTitel: "Vervanger gezocht",
  vervangerBody: '{klus}: je klus staat als "Vervanging" op het platform.',
};

export type MeldingTeksten = typeof MELDING_NL;
