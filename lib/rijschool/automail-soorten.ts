// De soorten mails van de automailer (lib/rijschool/automailer.ts), los gehouden
// zodat het beheer (in de browser) de lijst kan tonen zonder databasecode.

export const AUTOMAILS = [
  { id: "tegoed", titel: "Tegoed bijna op", uitleg: "Na een les, als het tegoed niet genoeg meer is voor nog een les. Hoogstens eens per 14 dagen." },
  { id: "proefles", titel: "Na de proefles", uitleg: "De dag na een gereden proefles: bedankt, en hoe je verder gaat." },
  { id: "stil", titel: "Lang niet gereden", uitleg: "Een actieve leerling zonder les in de afgelopen 3 weken en zonder geplande les. Hoogstens eens per 30 dagen." },
  { id: "geslaagd", titel: "Geslaagd", uitleg: "Een felicitatie zodra je een leerling op Geslaagd zet." },
] as const;

export type AutomailId = (typeof AUTOMAILS)[number]["id"];
export type AutomailInstellingen = Record<AutomailId, boolean>;
