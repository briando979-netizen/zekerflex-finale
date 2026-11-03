// Teksten van TwoFactorSettings. Alleen platte strings (met {n}/{date} als plek
// voor een waarde), zodat een serverpagina ze als prop kan meegeven. Werkgevers
// en beheer gebruiken de Nederlandse standaard; het werkersdashboard geeft de
// vertaling uit lib/i18n/freelancer.ts (sectie twofa) mee.

export interface TwoFactorTexts {
  dateLocale: string;
  loading: string;
  genericError: string;
  recoveryFileHeader: string;
  saveTitle: string;
  saveBody: string;
  copy: string;
  download: string;
  savedCheck: string;
  done: string;
  step1: string;
  step2: string;
  step3: string;
  addToApp: string;
  typeKey: string;
  codeFromApp: string;
  checking: string;
  confirm: string;
  cancel: string;
  intro: string;
  recommended: string;
  busy: string;
  enable: string;
  on: string;
  since: string;
  recoveryLeftOne: string;
  recoveryLeftMany: string;
  lowCodes: string;
  newCodes: string;
  disable: string;
  codeToDisable: string;
  create: string;
}

export const TWO_FACTOR_NL: TwoFactorTexts = {
  dateLocale: "nl-NL",
  loading: "Laden…",
  genericError: "Dat lukte niet. Probeer het opnieuw.",
  recoveryFileHeader: "ZekerFlex herstelcodes (elke code werkt één keer)",
  saveTitle: "Bewaar je herstelcodes",
  saveBody: "Telefoon kwijt? Met een van deze codes kom je toch binnen. Elke code werkt één keer. We laten ze maar één keer zien.",
  copy: "Kopiëren",
  download: "Downloaden",
  savedCheck: "Ik heb mijn herstelcodes veilig bewaard",
  done: "Klaar",
  step1: "Installeer een authenticator-app (bijv. Google Authenticator, Microsoft Authenticator of 1Password).",
  step2: "Scan de QR-code met de app — of op je telefoon: tik op “Toevoegen aan app”.",
  step3: "Vul de 6-cijferige code in die de app laat zien.",
  addToApp: "Toevoegen aan app",
  typeKey: "Of typ deze sleutel over:",
  codeFromApp: "Code uit de app",
  checking: "Controleren…",
  confirm: "Bevestigen",
  cancel: "Annuleren",
  intro: "Met tweestapsverificatie heb je naast je wachtwoord ook een code van je telefoon nodig om in te loggen. Een gestolen wachtwoord is dan niet genoeg.",
  recommended: " Sterk aangeraden voor jouw account: je hebt toegang tot betalingen en persoonsgegevens.",
  busy: "Bezig…",
  enable: "Tweestapsverificatie aanzetten",
  on: "✓ Aan",
  since: " sinds {date}",
  recoveryLeftOne: " · 1 herstelcode over",
  recoveryLeftMany: " · {n} herstelcodes over",
  lowCodes: "Je hebt nog maar weinig herstelcodes — maak nieuwe aan.",
  newCodes: "Nieuwe herstelcodes",
  disable: "Uitzetten",
  codeToDisable: "Code om uit te zetten",
  create: "Aanmaken",
};
