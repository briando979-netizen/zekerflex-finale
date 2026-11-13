// Teksten van PersonalInfoForm (naam en telefoon in het account). Alleen platte strings, zodat een serverpagina ze als
// prop kan meegeven. Werkgever en studio gebruiken de Nederlandse standaard; het werkersdashboard (/dashboard/profiel)
// geeft de vertaling uit lib/i18n/freelancer.ts (sectie persoonForm) mee. Zelfde aanpak als
// components/app/notifications-texts.ts (13 nov 2026: de meldingen na het opslaan waren altijd Nederlands).

/** Wat de actie terugmeldt; het formulier zoekt er de tekst in de taal van de gebruiker bij. */
export type PersonalInfoCode = "opgeslagen" | "naam" | "naamVast" | "mislukt";

export interface PersonalInfoTexts {
  naam: string;
  telefoon: string;
  /** achter het label van de telefoon */
  optioneel: string;
  opslaan: string;
  bezig: string;
  meldingen: Record<PersonalInfoCode, string>;
}

export const PERSONAL_INFO_NL: PersonalInfoTexts = {
  naam: "Volledige naam",
  telefoon: "Telefoonnummer",
  optioneel: "(optioneel)",
  opslaan: "Opslaan",
  bezig: "Opslaan…",
  meldingen: {
    opgeslagen: "Gegevens opgeslagen.",
    naam: "Vul je volledige naam in.",
    naamVast: "Je naam is bevestigd met je identiteitsbewijs. Wil je hem wijzigen? Neem contact op met support.",
    mislukt: "Opslaan is mislukt. Probeer het opnieuw.",
  },
};
