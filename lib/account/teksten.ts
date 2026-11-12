// Teksten van drie losse onderdelen van het werker-Account en de werker-kop die nog Nederlands waren (12 nov 2026, opmaakmeting in PL):
// de pushkaart (PushToggle), "Ziek melden" en de weergave-schakelaar (licht/donker). Puur bestand: de Nederlandse standaard staat hier,
// de vijf talen in lib/i18n/freelancer.ts (accountDelen); de werker-app geeft ze als `texts` mee, werkgever en beheer houden de standaard.

export const PUSH_KAART_NL = {
  titel: "Pushmeldingen",
  uitleg: "Krijg een melding bij een oproep, een nieuw bericht of een dienst voor jou — ook als ZekerFlex dicht is.",
  uitlegIos: "Op iPhone werkt dit zodra ZekerFlex op je beginscherm staat (Deel → Zet op beginscherm).",
  nietBeschikbaar: "Niet beschikbaar",
  geblokkeerd: "Geblokkeerd in je browser",
  bezig: "Bezig…",
  uitzetten: "Uitzetten",
  aanzetten: "Aanzetten",
  testKnop: "Stuur test-melding",
  testVersturen: "Versturen…",
  testVerstuurd: "Verstuurd naar {n} apparaat/apparaten — zet de app op de achtergrond om 'm te zien.",
  testGeen: "Geen aangemelde apparaten gevonden. Zet meldingen op dit apparaat eerst aan.",
  testMislukt: "Versturen mislukt.",
  geweigerdApp: "Meldingen staan uit voor de app. Zet ze aan op je telefoon: Instellingen → Apps → ZekerFlex → Meldingen → toestaan, en open de app opnieuw.",
  geweigerdBrowser: "Je hebt meldingen eerder geweigerd. Zet ze weer aan via het slotje in de adresbalk.",
  aanzettenMislukt: "Aanzetten lukte niet ({melding}). Probeer het opnieuw.",
  onbekend: "onbekend",
};
export type PushKaartTeksten = typeof PUSH_KAART_NL;

export const ZIEK_NL = {
  titel: "Ziek melden",
  uitleg: "We zoeken meteen vervanging voor je geplande diensten en melden het aan je opdrachtgever.",
  knop: "Ziek melden",
  beterschap: "Beterschap!",
  metDiensten: "Voor {n} dienst(en) zoeken we nu vervanging.",
  geenDiensten: "Er stonden geen diensten gepland.",
  vanaf: "Vanaf",
  tot: "Tot (optioneel)",
  bevestig: "Bevestig ziekmelding",
  bezig: "Bezig…",
  annuleren: "Annuleren",
  mislukt: "Mislukt",
};
export type ZiekTeksten = typeof ZIEK_NL;

export const THEMA_NL = {
  weergave: "Weergave",
  licht: "Licht",
  donker: "Donker",
  zetLichtAan: "Zet lichte weergave aan",
  zetDonkerAan: "Zet donkere weergave aan",
};
export type ThemaTeksten = typeof THEMA_NL;
