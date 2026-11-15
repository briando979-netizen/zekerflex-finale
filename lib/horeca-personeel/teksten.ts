import type { Locale } from "@/lib/i18n/config";
import type { Blok } from "@/lib/horeca-personeel/model";
import { PLANNING_EN, PLANNING_NL, type PlanningTeksten } from "@/lib/horeca-personeel/planning-teksten";

// ---------------------------------------------------------------------------
// Alle tekst van het eigen personeel van een horecazaak, in Nederlands en Engels: het beheer van de opdrachtgever
// (components/horeca/beheer/PersoneelTab.tsx), de uitnodigingspagina en de omgeving van de medewerker (app/personeel).
// De server kiest de taal en geeft alleen die mee; een tekst met een invulling heeft een plaatshouder ({naam}) die de
// client met vulIn invult. Puur bestand, zonder functies in de data.
// Machine-assisted translation (EN): native-speaker review recommended.
// ---------------------------------------------------------------------------

export interface PersoneelTeksten {
  taal: "nl-NL" | "en-GB";
  blok: Record<Blok, { naam: string; uitleg: string }>;
  binnenkort: string;
  beheer: {
    kop: string;
    intro: string;
    dashboardsKop: string;
    dashboardsUitleg: string;
    geenDashboards: string;
    voorbeeldKnop: string;
    nieuwDashboard: string;
    dashboardNaam: string;
    blokkenLabel: string;
    bewaar: string;
    annuleer: string;
    wijzig: string;
    verwijder: string;
    verwijderDashboardVraag: string;
    medewerkersKop: string;
    medewerkersUitleg: string;
    geenMedewerkers: string;
    eerstDashboard: string;
    uitnodigenKop: string;
    naam: string;
    email: string;
    functie: string;
    dashboard: string;
    uitnodigenKnop: string;
    uitnodigingVerstuurd: string;
    mailMislukt: string;
    linkLabel: string;
    kopieer: string;
    gekopieerd: string;
    status: { uitgenodigd: string; actief: string; gestopt: string };
    nieuweLink: string;
    stop: string;
    stopVraag: string;
    haalWeg: string;
    mededelingenKop: string;
    mededelingenUitleg: string;
    mededelingTekst: string;
    mededelingVoor: string;
    iedereen: string;
    plaats: string;
    geenMededelingen: string;
    bezig: string;
    fout: string;
    gelezenDoor: string;
    loonstroken: string;
    loonstrokenUitleg: string;
    periode: string;
    pdfKies: string;
    toevoegen: string;
    geenLoonstroken: string;
    downloaden: string;
    sluit: string;
  };
  uitnodiging: {
    titel: string;
    ongeldig: string;
    intro: string;
    naam: string;
    wachtwoord: string;
    herhaal: string;
    maak: string;
    bezig: string;
    bestaatAl: string;
    naarInloggen: string;
    gekoppeld: string;
  };
  omgeving: {
    titel: string;
    hallo: string;
    geenBlokken: string;
    mededelingenKop: string;
    geenMededelingen: string;
    takenKop: string;
    takenUitleg: string;
    geenTaken: string;
    metenLabel: string;
    afgevinktDoor: string;
    afvinken: string;
    terugdraaien: string;
    buitenGrens: string;
    loonstrokenKop: string;
    berichtenKop: string;
    geenLoonstroken: string;
    downloaden: string;
    binnenkort: string;
    uitloggen: string;
    geenToegang: string;
    fout: string;
    bezig: string;
  };
  mail: { onderwerp: string; hoi: string; tekst: string; knop: string; geldig: string };
  planning: PlanningTeksten;
  chat: { kop: string; team: string; metBeheer: string; gesprek: string; schrijf: string; verstuur: string; geen: string; beheerder: string; verwijder: string; bezig: string; fout: string; teamUitleg: string };
}

const nl: PersoneelTeksten = {
  taal: "nl-NL",
  blok: {
    taken: { naam: "Taken", uitleg: "De takenlijsten van de zaak (openen, sluiten, schoonmaak en metingen), om af te vinken." },
    mededelingen: { naam: "Mededelingen", uitleg: "Berichten van jou aan het team, bijvoorbeeld over het rooster of een actie." },
    rooster: { naam: "Rooster", uitleg: "Medewerkers zien hun diensten, kunnen doorgeven wanneer ze niet kunnen en diensten ruilen of een open dienst nemen." },
    verlof: { naam: "Verlof", uitleg: "Medewerkers vragen verlof aan; jij keurt het goed of af." },
    uren: { naam: "Uren", uitleg: "Medewerkers klokken in en uit; jij ziet de uren en kunt ze als csv downloaden." },
    loonstroken: { naam: "Loonstroken", uitleg: "Medewerkers zien hier hun eigen loonstroken (pdf) die jij voor hen klaarzet." },
    berichten: { naam: "Berichten", uitleg: "Een teamkanaal voor iedereen en een eigen gesprek met jou, om te chatten." },
  },
  binnenkort: "Binnenkort",
  beheer: {
    kop: "Personeel",
    intro: "Nodig je eigen medewerkers uit. Ze maken zelf een account en zien daarna alleen het dashboard dat jij voor hun rol hebt ingesteld.",
    dashboardsKop: "Dashboards per rol",
    dashboardsUitleg: "Een dashboard bepaalt wat een medewerker ziet. Maak er bijvoorbeeld een voor de bediening en een voor de keuken, met andere onderdelen.",
    geenDashboards: "Je hebt nog geen dashboards.",
    voorbeeldKnop: "Voorbeeld toevoegen (bediening en keuken)",
    nieuwDashboard: "Nieuw dashboard",
    dashboardNaam: "Naam van de rol",
    blokkenLabel: "Wat ziet deze rol?",
    bewaar: "Bewaren",
    annuleer: "Annuleren",
    wijzig: "Wijzigen",
    verwijder: "Verwijderen",
    verwijderDashboardVraag: "Dit dashboard verwijderen?",
    medewerkersKop: "Medewerkers",
    medewerkersUitleg: "Wie je uitnodigt krijgt een mail met een link om een account te maken. Je kunt de link ook zelf doorgeven.",
    geenMedewerkers: "Je hebt nog geen medewerkers uitgenodigd.",
    eerstDashboard: "Maak eerst een dashboard, dan kun je medewerkers uitnodigen.",
    uitnodigenKop: "Medewerker uitnodigen",
    naam: "Naam",
    email: "E-mailadres",
    functie: "Functie (bijvoorbeeld souschef)",
    dashboard: "Dashboard",
    uitnodigenKnop: "Uitnodigen",
    uitnodigingVerstuurd: "Uitnodiging gemaakt en gemaild naar {email}.",
    mailMislukt: "De uitnodiging is gemaakt, maar de mail kwam niet aan. Geef de link zelf door.",
    linkLabel: "Link om een account te maken",
    kopieer: "Link kopiëren",
    gekopieerd: "Gekopieerd",
    status: { uitgenodigd: "Uitgenodigd", actief: "Actief", gestopt: "Gestopt" },
    nieuweLink: "Nieuwe link",
    stop: "Stoppen",
    stopVraag: "{naam} kan dan niet meer inloggen bij je zaak. Doorgaan?",
    haalWeg: "Uit de lijst halen",
    mededelingenKop: "Mededelingen",
    mededelingenUitleg: "Een bericht aan je team. Het staat bovenaan hun dashboard.",
    mededelingTekst: "Wat wil je het team laten weten?",
    mededelingVoor: "Voor wie?",
    iedereen: "Iedereen",
    plaats: "Plaatsen",
    geenMededelingen: "Er zijn geen mededelingen.",
    bezig: "Bezig…",
    fout: "Dat lukte niet. Probeer het zo nog eens.",
    gelezenDoor: "Gelezen door {n} van {totaal}",
    loonstroken: "Loonstroken",
    loonstrokenUitleg: "Zet de pdf van de loonstrook klaar. Alleen deze medewerker ziet hem, op zijn eigen dashboard (als dat het onderdeel Loonstroken heeft).",
    periode: "Periode (bijvoorbeeld oktober 2026)",
    pdfKies: "Kies een pdf (maximaal 3 MB)",
    toevoegen: "Toevoegen",
    geenLoonstroken: "Nog geen loonstroken.",
    downloaden: "Downloaden",
    sluit: "Sluiten",
  },
  uitnodiging: {
    titel: "Welkom bij {zaak}",
    ongeldig: "Deze uitnodiging is niet meer geldig. Vraag je werkgever om een nieuwe link.",
    intro: "Je bent uitgenodigd om mee te werken bij {zaak}. Maak een account met het e-mailadres {email}.",
    naam: "Je volledige naam",
    wachtwoord: "Kies een wachtwoord",
    herhaal: "Herhaal het wachtwoord",
    maak: "Account maken",
    bezig: "Bezig…",
    bestaatAl: "Er bestaat al een account met dit e-mailadres. Log in om de uitnodiging te gebruiken.",
    naarInloggen: "Naar inloggen",
    gekoppeld: "Je account is gekoppeld aan {zaak}.",
  },
  omgeving: {
    titel: "Mijn werk bij {zaak}",
    hallo: "Hallo {naam}",
    geenBlokken: "Je werkgever heeft nog niets voor je klaargezet.",
    mededelingenKop: "Mededelingen",
    geenMededelingen: "Geen mededelingen.",
    takenKop: "Taken van vandaag",
    takenUitleg: "Vink af wat je gedaan hebt. Bij een meting vul je de waarde in.",
    geenTaken: "Er zijn geen takenlijsten voor vandaag.",
    metenLabel: "Gemeten waarde",
    afgevinktDoor: "afgevinkt door {naam}",
    afvinken: "Afvinken",
    terugdraaien: "Terugdraaien",
    buitenGrens: "Let op: buiten de grens.",
    loonstrokenKop: "Loonstroken",
    berichtenKop: "Berichten",
    geenLoonstroken: "Er zijn nog geen loonstroken voor je klaargezet.",
    downloaden: "Downloaden",
    binnenkort: "Komt binnenkort.",
    uitloggen: "Uitloggen",
    geenToegang: "Je hebt geen toegang meer tot deze zaak.",
    fout: "Dat lukte niet. Probeer het zo nog eens.",
    bezig: "Bezig…",
  },
  mail: {
    onderwerp: "Je bent uitgenodigd bij {zaak}",
    hoi: "Hoi {naam},",
    tekst: "{beheerder} nodigt je uit om mee te werken bij {zaak}. Maak een account met de knop hieronder.",
    knop: "Account maken",
    geldig: "Deze link is {dagen} dagen geldig.",
  },
  planning: PLANNING_NL,
  chat: {
    kop: "Berichten",
    team: "Team",
    metBeheer: "Met de beheerder",
    gesprek: "Gesprek",
    schrijf: "Schrijf een bericht",
    verstuur: "Versturen",
    geen: "Nog geen berichten.",
    beheerder: "Beheerder",
    verwijder: "Weghalen",
    bezig: "Bezig…",
    fout: "Dat lukte niet. Probeer het zo nog eens.",
    teamUitleg: "Iedereen van de zaak ziet de berichten in dit kanaal.",
  },
};

const en: PersoneelTeksten = {
  taal: "en-GB",
  blok: {
    taken: { naam: "Tasks", uitleg: "The venue's task lists (opening, closing, cleaning and readings), to tick off." },
    mededelingen: { naam: "Announcements", uitleg: "Messages from you to the team, for example about the rota or an offer." },
    rooster: { naam: "Rota", uitleg: "Staff see their shifts, can say when they cannot work and swap shifts or take an open shift." },
    verlof: { naam: "Leave", uitleg: "Staff request leave; you approve or decline it." },
    uren: { naam: "Hours", uitleg: "Staff clock in and out; you see the hours and can download them as csv." },
    loonstroken: { naam: "Payslips", uitleg: "Staff see their own payslips (pdf) here, which you put ready for them." },
    berichten: { naam: "Messages", uitleg: "A team channel for everyone and a private conversation with you, to chat." },
  },
  binnenkort: "Coming soon",
  beheer: {
    kop: "Staff",
    intro: "Invite your own staff. They create their own account and then only see the dashboard you set up for their role.",
    dashboardsKop: "Dashboards per role",
    dashboardsUitleg: "A dashboard decides what a staff member sees. For example, make one for front of house and one for the kitchen, with different parts.",
    geenDashboards: "You have no dashboards yet.",
    voorbeeldKnop: "Add an example (front of house and kitchen)",
    nieuwDashboard: "New dashboard",
    dashboardNaam: "Name of the role",
    blokkenLabel: "What does this role see?",
    bewaar: "Save",
    annuleer: "Cancel",
    wijzig: "Edit",
    verwijder: "Delete",
    verwijderDashboardVraag: "Delete this dashboard?",
    medewerkersKop: "Staff members",
    medewerkersUitleg: "Anyone you invite gets an email with a link to create an account. You can also pass the link on yourself.",
    geenMedewerkers: "You have not invited any staff yet.",
    eerstDashboard: "Create a dashboard first, then you can invite staff.",
    uitnodigenKop: "Invite a staff member",
    naam: "Name",
    email: "Email address",
    functie: "Job title (for example sous chef)",
    dashboard: "Dashboard",
    uitnodigenKnop: "Invite",
    uitnodigingVerstuurd: "Invitation created and emailed to {email}.",
    mailMislukt: "The invitation was created, but the email did not arrive. Pass the link on yourself.",
    linkLabel: "Link to create an account",
    kopieer: "Copy link",
    gekopieerd: "Copied",
    status: { uitgenodigd: "Invited", actief: "Active", gestopt: "Stopped" },
    nieuweLink: "New link",
    stop: "Stop",
    stopVraag: "{naam} will no longer be able to sign in at your venue. Continue?",
    haalWeg: "Remove from list",
    mededelingenKop: "Announcements",
    mededelingenUitleg: "A message to your team. It appears at the top of their dashboard.",
    mededelingTekst: "What do you want the team to know?",
    mededelingVoor: "For whom?",
    iedereen: "Everyone",
    plaats: "Post",
    geenMededelingen: "There are no announcements.",
    bezig: "Working…",
    fout: "That did not work. Please try again in a moment.",
    gelezenDoor: "Read by {n} of {totaal}",
    loonstroken: "Payslips",
    loonstrokenUitleg: "Put the payslip pdf ready. Only this staff member sees it, on their own dashboard (if it has the Payslips part).",
    periode: "Period (for example October 2026)",
    pdfKies: "Choose a pdf (maximum 3 MB)",
    toevoegen: "Add",
    geenLoonstroken: "No payslips yet.",
    downloaden: "Download",
    sluit: "Close",
  },
  uitnodiging: {
    titel: "Welcome to {zaak}",
    ongeldig: "This invitation is no longer valid. Ask your employer for a new link.",
    intro: "You have been invited to work at {zaak}. Create an account with the email address {email}.",
    naam: "Your full name",
    wachtwoord: "Choose a password",
    herhaal: "Repeat the password",
    maak: "Create account",
    bezig: "Working…",
    bestaatAl: "An account with this email address already exists. Sign in to use the invitation.",
    naarInloggen: "Go to sign in",
    gekoppeld: "Your account is now linked to {zaak}.",
  },
  omgeving: {
    titel: "My work at {zaak}",
    hallo: "Hello {naam}",
    geenBlokken: "Your employer has not set anything up for you yet.",
    mededelingenKop: "Announcements",
    geenMededelingen: "No announcements.",
    takenKop: "Today's tasks",
    takenUitleg: "Tick off what you have done. For a reading, enter the value.",
    geenTaken: "There are no task lists for today.",
    metenLabel: "Measured value",
    afgevinktDoor: "ticked off by {naam}",
    afvinken: "Tick off",
    terugdraaien: "Undo",
    buitenGrens: "Careful: outside the limit.",
    loonstrokenKop: "Payslips",
    berichtenKop: "Messages",
    geenLoonstroken: "No payslips have been put ready for you yet.",
    downloaden: "Download",
    binnenkort: "Coming soon.",
    uitloggen: "Sign out",
    geenToegang: "You no longer have access to this venue.",
    fout: "That did not work. Please try again in a moment.",
    bezig: "Working…",
  },
  mail: {
    onderwerp: "You have been invited to {zaak}",
    hoi: "Hi {naam},",
    tekst: "{beheerder} invites you to work at {zaak}. Create an account with the button below.",
    knop: "Create account",
    geldig: "This link is valid for {dagen} days.",
  },
  planning: PLANNING_EN,
  chat: {
    kop: "Messages",
    team: "Team",
    metBeheer: "With the manager",
    gesprek: "Conversation",
    schrijf: "Write a message",
    verstuur: "Send",
    geen: "No messages yet.",
    beheerder: "Manager",
    verwijder: "Remove",
    bezig: "Working…",
    fout: "That did not work. Please try again in a moment.",
    teamUitleg: "Everyone at the venue sees the messages in this channel.",
  },
};

export function personeelTeksten(locale: Locale): PersoneelTeksten {
  return locale === "en" ? en : nl;
}
