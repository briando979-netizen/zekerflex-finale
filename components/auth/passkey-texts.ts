// Teksten van PasskeySettings. Alleen platte strings (met {date}/{n} als plek
// voor een waarde), zodat een serverpagina ze als prop kan meegeven. Werkgevers
// gebruiken de Nederlandse standaard; het werkersdashboard geeft de vertaling
// uit lib/i18n/freelancer.ts (sectie passkeys) mee.

export interface PasskeyTexts {
  dateLocale: string;
  loading: string;
  genericError: string;
  intro: string;
  unsupported: string;
  notHere: string;
  none: string;
  add: string;
  nameLabel: string;
  confirmIntro: string;
  password: string;
  code: string;
  next: string;
  deviceStep: string;
  busy: string;
  cancel: string;
  added: string;
  createdOn: string;
  lastUsed: string;
  neverUsed: string;
  synced: string;
  remove: string;
  removeConfirm: string;
  removeYes: string;
  cancelled: string;
  exists: string;
  wrongPassword: string;
  wrongCode: string;
  expired: string;
  max: string;
  refused: string;
  tooMany: string;
  down: string;
  mailIntro: string;
  mailSent: string;
  mailCode: string;
  sendCode: string;
  resend: string;
  mailWrong: string;
  mailExpired: string;
  mailFailed: string;
}

export const PASSKEY_NL: PasskeyTexts = {
  dateLocale: "nl-NL",
  loading: "Laden…",
  genericError: "Dat lukte niet. Probeer het opnieuw.",
  intro: "Met een passkey log je in met je vingerafdruk, je gezicht of de pincode van je telefoon of computer. Je hoeft geen wachtwoord te typen, en een nepsite kan er niets mee.",
  unsupported: "Deze browser kan geen passkeys gebruiken. Probeer een recente versie van Chrome, Safari, Edge of Firefox.",
  notHere: "Passkeys werken alleen op zekerflex.com.",
  none: "Je hebt nog geen passkey.",
  add: "Passkey toevoegen",
  nameLabel: "Naam van dit toestel",
  confirmIntro: "Bevestig eerst dat jij het bent.",
  password: "Je wachtwoord",
  code: "Code uit je authenticator-app",
  next: "Doorgaan",
  deviceStep: "Bevestig nu op je toestel met je vingerafdruk, gezicht of pincode.",
  busy: "Bezig…",
  cancel: "Annuleren",
  added: "Passkey toegevoegd. Je kunt er voortaan mee inloggen.",
  createdOn: "Toegevoegd op {date}",
  lastUsed: "laatst gebruikt op {date}",
  neverUsed: "nog niet gebruikt",
  synced: "gesynchroniseerd",
  remove: "Verwijderen",
  removeConfirm: "Weet je het zeker? Met dit toestel log je daarna weer in met je wachtwoord.",
  removeYes: "Ja, verwijderen",
  cancelled: "Er is geen passkey gemaakt. Probeer het opnieuw als je wilt.",
  exists: "Dit toestel heeft al een passkey voor jouw account.",
  wrongPassword: "Dat wachtwoord klopt niet.",
  wrongCode: "Die code klopt niet (of is al gebruikt). Probeer de nieuwste code uit je app.",
  expired: "Dat duurde te lang. Begin opnieuw.",
  max: "Je hebt al het maximale aantal passkeys. Verwijder er eerst een.",
  refused: "Dit toestel kon niet als passkey worden toegevoegd.",
  tooMany: "Te veel pogingen. Wacht een kwartier en probeer het dan opnieuw.",
  down: "Een passkey toevoegen lukt nu even niet. Probeer het later opnieuw.",
  mailIntro: "Je account heeft geen wachtwoord. We sturen een code naar je e-mailadres om te bevestigen dat jij het bent.",
  mailSent: "We hebben een code naar je e-mailadres gestuurd. Hij is 15 minuten geldig.",
  mailCode: "Code uit de e-mail",
  sendCode: "Stuur code",
  resend: "Nieuwe code sturen",
  mailWrong: "Die code klopt niet. Gebruik de code uit de nieuwste e-mail.",
  mailExpired: "Er is geen geldige code (meer). Vraag een nieuwe code aan.",
  mailFailed: "De code kon niet worden verstuurd. Probeer het later opnieuw.",
};
