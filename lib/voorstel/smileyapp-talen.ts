import type { Pakket, Vraag } from "@/lib/voorstel/smileyapp";
import type { ReviewTeksten } from "@/lib/voorstel/smileyapp-review-regels";
import { KADER, TALEN, VERTALINGEN, euroTaal, isTaal, type KaderTeksten, type Taal, type Vertaling } from "@/lib/voorstel/smileyapp-taal";
import { vul, type FormulierTeksten, type KiezerTeksten, type ProbeerTeksten } from "@/lib/voorstel/smileyapp-teksten";

// ---------------------------------------------------------------------------
// Het SmileyApp-voorstel in het Engels (/en) en het Duits (/de), 19 nov 2026:
// per taal één object met alle teksten van de landingspagina en de
// demo-aanvraag. Beide talen hebben hetzelfde type, dus TypeScript dwingt af
// dat er niets ontbreekt (tests/voorstel-smileyapp-talen.test.ts controleert
// dat ook, en dat geen waarde leeg is). Het is een vertaling van de Nederlandse
// teksten in lib/voorstel/smileyapp.ts: er staat niets in wat daar niet staat.
// Namen van pakketten, mensen en organisaties blijven zoals ze zijn. Bedragen
// staan hier nergens: een prijs komt altijd uit het pakket zelf (met de
// wijzigingen uit het beheer) en wordt met euroTaal() opgemaakt. De onderdelen
// van een pakket zijn Nederlandse gegevens die het team kan aanpassen; hier
// staat de vertaling van de standaard-onderdelen, en wat het team zelf schreef
// blijft Nederlands. Puur bestand; alleen de pagina's op de server laden het.
// ---------------------------------------------------------------------------

export { TALEN, VERTALINGEN, isTaal };
export type { Taal, Vertaling };

/**
 * Het blok met reviews die het team zelf invoert (deel 4): de kop, de toegankelijke tekst bij de sterren en de voetregel.
 * De tekst van een review zelf blijft in de taal waarin hij is ingevoerd. Nederlands: REVIEWS_NL in smileyapp-review-regels.ts.
 */
const REVIEWS_EN: ReviewTeksten = {
  boven: "Reviews",
  kop: "What customers say",
  samenvatting: "{gemiddelde} out of 5 stars from {aantal} reviews",
  samenvattingEen: "{gemiddelde} out of 5 stars from 1 review",
  sterren: "{n} out of 5 stars",
  bron: "Source: {bron}",
  bronLink: "Read the review at the source ({bron})",
  nieuwVenster: "(opens in a new tab)",
  voet: "Reviews copied by Smileyapp itself from the source mentioned.",
  bronnen: { Google: "Google", Trustpilot: "Trustpilot", "E-mail": "email", Anders: "other source" },
};

const REVIEWS_DE: ReviewTeksten = {
  boven: "Bewertungen",
  kop: "Was Kunden sagen",
  samenvatting: "{gemiddelde} von 5 Sternen aus {aantal} Bewertungen",
  samenvattingEen: "{gemiddelde} von 5 Sternen aus 1 Bewertung",
  sterren: "{n} von 5 Sternen",
  bron: "Quelle: {bron}",
  bronLink: "Die Bewertung bei der Quelle lesen ({bron})",
  nieuwVenster: "(öffnet einen neuen Tab)",
  voet: "Bewertungen von Smileyapp selbst aus der genannten Quelle übernommen.",
  bronnen: { Google: "Google", Trustpilot: "Trustpilot", "E-mail": "E-Mail", Anders: "andere Quelle" },
};

/** De standaard-onderdelen van de pakketten (lib/voorstel/smileyapp.ts, PAKKETTEN) in het Engels. */
const ONDERDELEN_EN = {
  "1 vragenlijst": "1 questionnaire",
  "10 vragen": "10 questions",
  "100 beoordelingen": "100 ratings",
  "Eigen huisstijl": "Your own house style",
  "Gepersonaliseerde QR-code": "Personalised QR code",
  "1 gebruiker": "1 user",
  Instelservice: "Set-up service",
  "10 vragenlijsten": "10 questionnaires",
  "100 vragen": "100 questions",
  "1.000 beoordelingen": "1,000 ratings",
  "Meerdere gebruikers": "Multiple users",
  "2 referentie-interviews per week met quotes": "2 reference interviews per week with quotes",
  "Vragenlijsten en beoordelingen": "Questionnaires and ratings",
  "Maandelijkse call om de referenties te bespreken": "Monthly call to discuss the references",
  "Bedrijfskleuren op de vragenlijst": "Company colours on the questionnaire",
  "Gepersonaliseerd logo": "Personalised logo",
};

const ONDERDELEN_DE: typeof ONDERDELEN_EN = {
  "1 vragenlijst": "1 Fragebogen",
  "10 vragen": "10 Fragen",
  "100 beoordelingen": "100 Bewertungen",
  "Eigen huisstijl": "Eigenes Corporate Design",
  "Gepersonaliseerde QR-code": "Personalisierter QR-Code",
  "1 gebruiker": "1 Benutzer",
  Instelservice: "Einrichtungsservice",
  "10 vragenlijsten": "10 Fragebögen",
  "100 vragen": "100 Fragen",
  "1.000 beoordelingen": "1.000 Bewertungen",
  "Meerdere gebruikers": "Mehrere Benutzer",
  "2 referentie-interviews per week met quotes": "2 Referenzinterviews pro Woche mit Zitaten",
  "Vragenlijsten en beoordelingen": "Fragebögen und Bewertungen",
  "Maandelijkse call om de referenties te bespreken": "Monatliches Gespräch, um die Referenzen zu besprechen",
  "Bedrijfskleuren op de vragenlijst": "Unternehmensfarben im Fragebogen",
  "Gepersonaliseerd logo": "Personalisiertes Logo",
};

/** De standaard-linten van de prijskaarten. */
const LABELS_EN = { Populair: "Popular", "Meest gebruikt": "Most used", VIP: "VIP" };
const LABELS_DE: typeof LABELS_EN = { Populair: "Beliebt", "Meest gebruikt": "Meistgenutzt", VIP: "VIP" };

/** De uitleg bij het pakket op aanvraag (niet aan te passen in het beheer), per Nederlandse alinea. */
const UITLEG_EN = {
  'Heb je andere wensen? Wil je dat wij de vragenlijsten ontwikkelen en bijhouden? Elk bedrijf of organisatie is anders en heeft waarschijnlijk ook andere wensen om de "verschillende soorten" tevredenheid te meten.':
    "Do you have other wishes? Would you like us to develop and maintain the questionnaires? Every company or organisation is different and probably has different wishes for measuring the “different kinds” of satisfaction.",
  "Hiervoor hebben we het maatwerk pakket! Dit pakket kun je zelf samenstellen zodat jij exact krijgt wat je nodig hebt.":
    "That is what the Maatwerk Pakket (the custom package) is for! You can put this package together yourself, so that you get exactly what you need.",
  "Misschien heb je meerdere vestigingen, wil je meerdere aspecten binnen je organisatie meten of heb je een (meerdaags)evenement?":
    "Perhaps you have several locations, want to measure several aspects within your organisation, or have a (multi-day) event?",
  "Neem contact op en we helpen je graag!": "Get in touch and we will be happy to help!",
};

const UITLEG_DE: typeof UITLEG_EN = {
  'Heb je andere wensen? Wil je dat wij de vragenlijsten ontwikkelen en bijhouden? Elk bedrijf of organisatie is anders en heeft waarschijnlijk ook andere wensen om de "verschillende soorten" tevredenheid te meten.':
    "Haben Sie andere Wünsche? Möchten Sie, dass wir die Fragebögen entwickeln und pflegen? Jedes Unternehmen und jede Organisation ist anders und hat wahrscheinlich auch andere Wünsche, um die „verschiedenen Arten“ von Zufriedenheit zu messen.",
  "Hiervoor hebben we het maatwerk pakket! Dit pakket kun je zelf samenstellen zodat jij exact krijgt wat je nodig hebt.":
    "Dafür haben wir das Maatwerk Pakket (das Paket nach Maß)! Dieses Paket können Sie selbst zusammenstellen, sodass Sie genau das bekommen, was Sie brauchen.",
  "Misschien heb je meerdere vestigingen, wil je meerdere aspecten binnen je organisatie meten of heb je een (meerdaags)evenement?":
    "Vielleicht haben Sie mehrere Standorte, möchten mehrere Aspekte in Ihrer Organisation messen oder haben eine (mehrtägige) Veranstaltung?",
  "Neem contact op en we helpen je graag!": "Nehmen Sie Kontakt auf, wir helfen Ihnen gern!",
};

const FORMULIER_EN: FormulierTeksten = {
  taal: "en",
  naam: "Name",
  bedrijf: "Company or organisation",
  email: "Email address",
  telefoon: "Phone number",
  magLeeg: " (optional)",
  pakket: "Which package would you like to see?",
  pakketOnbekend: "I don't know yet",
  dag: "Preferred day",
  tijd: "Preferred time",
  geenVoorkeur: "No preference",
  tijdOptie: "{tijd}",
  momentUitleg: "We will call you at or around this time (working days between 09:00 and 17:00, Dutch time). It is your preference, not a fixed appointment.",
  afspraak: "Choose a time for your demo",
  afspraakGeen: "None of these times suit me",
  afspraakUitleg: "SmileyApp has made these times available for a 30-minute demo (Dutch time). If you choose one, the appointment is fixed straight away and you will receive a confirmation by email.",
  interesses: "I am interested in",
  berichtDemo: "What would you like to see or know?",
  berichtPartner: "Tell us briefly about your company or event",
  lokveld: "Leave this field empty",
  toestemmingDemo: "SmileyApp may call or email me about this request.",
  toestemmingPartner: "SmileyApp may call or email me about this registration.",
  bezig: "Sending…",
  verstuurDemo: "Request the demo",
  verstuurPartner: "Sign up as a partner",
  nietActief: "Please note: this is a design proposal. As long as SmileyApp does not yet use this admin environment, nobody at SmileyApp reads what you submit here. For now, please email",
  foutToestemming: "Please tick the box to confirm that SmileyApp may contact you about this request.",
  foutVersturen: "Sending failed. Please try again.",
  foutVerbinding: "Sending failed. Check your internet connection and try again.",
  foutTeVaak: "You have just sent a few requests. Please try again in ten minutes.",
  fouten: {
    naam: "Please enter your name.",
    bedrijf: "Please enter the name of your company or organisation.",
    email: "Please enter a valid email address.",
    telefoon: "Please enter a valid phone number: digits, spaces and optionally a plus. We need your number if you choose a day and time.",
    bericht: "Your message is too long.",
    toestemming: "Please tick the box to confirm that SmileyApp may contact you about this request.",
    pakket: "Please choose a package from the list.",
    dag: "Choose a working day from tomorrow, at most six weeks ahead. Or leave both the day and the time empty.",
    tijd: "Choose a time between 09:00 and 17:00. Or leave both the day and the time empty.",
    interesses: "Please choose from the list.",
    tijdId: "This time is no longer available. Please choose another time from the list.",
  },
  bedanktDemo: "Thank you, we have received your request",
  bedanktPartner: "Thank you, we have received your registration",
  moment: "{dag} at {tijd}",
  belMoment: "We will call you at or around {moment}. That time is your preference, not yet a fixed appointment.",
  bedanktAfspraak: "Your demo is scheduled for {moment} (Dutch time). You will receive a confirmation by email, with the appointment for your calendar.",
  contactOp: "We will contact you by email or phone.",
  kloptNiet: "Is something not right, or would you like to add something? Email",
};

const FORMULIER_DE: FormulierTeksten = {
  taal: "de",
  naam: "Name",
  bedrijf: "Unternehmen oder Organisation",
  email: "E-Mail-Adresse",
  telefoon: "Telefonnummer",
  magLeeg: " (optional)",
  pakket: "Welches Paket möchten Sie sehen?",
  pakketOnbekend: "Weiß ich noch nicht",
  dag: "Wunschtag",
  tijd: "Wunschzeit",
  geenVoorkeur: "Kein Wunsch",
  tijdOptie: "{tijd} Uhr",
  momentUitleg: "Wir rufen Sie ungefähr zu diesem Zeitpunkt an (werktags zwischen 09:00 und 17:00 Uhr, niederländische Zeit). Es ist Ihr Wunsch, kein fester Termin.",
  afspraak: "Wählen Sie eine Zeit für Ihre Demo",
  afspraakGeen: "Keine dieser Zeiten passt",
  afspraakUitleg: "Diese Zeiten hat SmileyApp für eine Demo von 30 Minuten freigegeben (niederländische Zeit). Wenn Sie eine wählen, steht der Termin sofort fest und Sie erhalten eine Bestätigung per E-Mail.",
  interesses: "Ich interessiere mich für",
  berichtDemo: "Was möchten Sie gern sehen oder wissen?",
  berichtPartner: "Erzählen Sie kurz etwas über Ihr Unternehmen oder Ihre Veranstaltung",
  lokveld: "Dieses Feld bitte leer lassen",
  toestemmingDemo: "SmileyApp darf mich wegen dieser Anfrage anrufen oder mir eine E-Mail schreiben.",
  toestemmingPartner: "SmileyApp darf mich wegen dieser Anmeldung anrufen oder mir eine E-Mail schreiben.",
  bezig: "Wird gesendet…",
  verstuurDemo: "Demo anfragen",
  verstuurPartner: "Als Partner anmelden",
  nietActief: "Bitte beachten Sie: Dies ist ein Designvorschlag. Solange SmileyApp diese Verwaltung noch nicht nutzt, liest niemand von SmileyApp, was Sie hier einsenden. Schreiben Sie vorerst eine E-Mail an",
  foutToestemming: "Bitte bestätigen Sie mit dem Häkchen, dass SmileyApp Sie wegen dieser Anfrage kontaktieren darf.",
  foutVersturen: "Das Senden hat nicht geklappt. Bitte versuchen Sie es erneut.",
  foutVerbinding: "Das Senden hat nicht geklappt. Prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
  foutTeVaak: "Sie haben gerade schon einige Anfragen gesendet. Bitte versuchen Sie es in zehn Minuten erneut.",
  fouten: {
    naam: "Bitte geben Sie Ihren Namen ein.",
    bedrijf: "Bitte geben Sie den Namen Ihres Unternehmens oder Ihrer Organisation ein.",
    email: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
    telefoon: "Bitte geben Sie eine gültige Telefonnummer ein: Ziffern, Leerzeichen und eventuell ein Plus. Wir brauchen Ihre Nummer, wenn Sie Tag und Uhrzeit wählen.",
    bericht: "Ihre Nachricht ist zu lang.",
    toestemming: "Bitte bestätigen Sie mit dem Häkchen, dass SmileyApp Sie wegen dieser Anfrage kontaktieren darf.",
    pakket: "Bitte wählen Sie ein Paket aus der Liste.",
    dag: "Wählen Sie einen Werktag ab morgen, höchstens sechs Wochen im Voraus. Oder lassen Sie Tag und Uhrzeit beide leer.",
    tijd: "Wählen Sie eine Uhrzeit zwischen 09:00 und 17:00 Uhr. Oder lassen Sie Tag und Uhrzeit beide leer.",
    interesses: "Bitte wählen Sie aus der Liste.",
    tijdId: "Diese Zeit ist nicht mehr frei. Bitte wählen Sie eine andere Zeit aus der Liste.",
  },
  bedanktDemo: "Vielen Dank, Ihre Anfrage ist eingegangen",
  bedanktPartner: "Vielen Dank, Ihre Anmeldung ist eingegangen",
  moment: "{dag} um {tijd} Uhr",
  belMoment: "Wir rufen Sie ungefähr zu diesem Zeitpunkt an: {moment}. Das ist Ihr Wunsch, noch kein fester Termin.",
  bedanktAfspraak: "Ihre Demo ist geplant für {moment} (niederländische Zeit). Sie erhalten eine Bestätigung per E-Mail, mit dem Termin für Ihren Kalender.",
  contactOp: "Wir melden uns per E-Mail oder Telefon bei Ihnen.",
  kloptNiet: "Stimmt etwas nicht oder möchten Sie etwas ergänzen? Schreiben Sie eine E-Mail an",
};

const PROBEER_EN: ProbeerTeksten = {
  voorbeeldvraag: "Sample question",
  waarde: "{score} out of 10",
  sleepUitleg: "Drag the smiley left or right, use the arrow keys or pick a number.",
  kiesCijfer: "Pick a number from 1 to 10",
  geefAntwoord: "Give this answer",
  pasAan: "Change answer",
  opnieuw: "Start again",
  privacy: "An example: your answer stays in your own browser; nothing is stored or sent.",
  dashboardKop: "This is what it looks like in your dashboard",
  voorbeeld: "Example",
  staafjes: "The bars are sample figures, not real results. Your answer is added as soon as you give it.",
  jouwAntwoord: "Your answer, a {score}, has been added. Average in this example: {gemiddelde} from {totaal} answers.",
  geefLinks: "Give your answer on the left and see what happens.",
  lijstNaam: "Example: number of answers per score",
  staafEen: "Score {cijfer}: {n} answer",
  staafMeer: "Score {cijfer}: {n} answers",
  staafVanJou: ", including yours",
  geleStaaf: "The yellow bar is your answer.",
  decimaal: ".",
};

const PROBEER_DE: ProbeerTeksten = {
  voorbeeldvraag: "Beispielfrage",
  waarde: "{score} von 10",
  sleepUitleg: "Ziehen Sie den Smiley nach links oder rechts, nutzen Sie die Pfeiltasten oder wählen Sie eine Zahl.",
  kiesCijfer: "Wählen Sie eine Zahl von 1 bis 10",
  geefAntwoord: "Diese Antwort geben",
  pasAan: "Antwort ändern",
  opnieuw: "Noch einmal",
  privacy: "Ein Beispiel: Ihre Antwort bleibt in Ihrem eigenen Browser, es wird nichts gespeichert oder gesendet.",
  dashboardKop: "So sieht es in Ihrem Dashboard aus",
  voorbeeld: "Beispiel",
  staafjes: "Die Balken sind Beispielzahlen, keine echten Ergebnisse. Ihre Antwort kommt hinzu, sobald Sie sie geben.",
  jouwAntwoord: "Ihre Antwort, eine {score}, ist hinzugekommen. Durchschnitt in diesem Beispiel: {gemiddelde} aus {totaal} Antworten.",
  geefLinks: "Geben Sie links Ihre Antwort und sehen Sie, was passiert.",
  lijstNaam: "Beispiel: Anzahl der Antworten pro Zahl",
  staafEen: "Zahl {cijfer}: {n} Antwort",
  staafMeer: "Zahl {cijfer}: {n} Antworten",
  staafVanJou: ", darunter Ihre",
  geleStaaf: "Der gelbe Balken ist Ihre Antwort.",
  decimaal: ",",
};

const KIEZER_EN: KiezerTeksten = {
  taal: "en",
  kop: "Which package suits me?",
  intro: "Three questions. The outcome follows from what the packages contain.",
  pastBijJou: "Suits you",
  maandelijks: "per month",
  opAanvraag: "On request",
  looptijd: "Minimum {n} months",
  periode: "The package does not state over which period the number of ratings applies. Ask about it in the demo.",
  pakketNaam: "The {naam}",
  andersEen: "{namen} works differently and does not follow from these three questions: see it under all packages.",
  andersMeer: "{namen} work differently and do not follow from these three questions: see them under all packages.",
  demoKnop: "Demo of this package",
  alleKnop: "View all packages",
  leeg: "Answer the three questions and you will see here which package suits you.",
  nogEen: "1 question to go.",
  nogMeer: "{n} questions to go.",
  vragen: { vragenlijsten: "How many questionnaires do you want to use?", beoordelingen: "How many ratings do you expect?", gebruikers: "How many people will work with it?" },
  enkel: { vragenlijsten: "1 questionnaire", beoordelingen: "1 rating", gebruikers: "1 user" },
  tot: "{van} to {tot}",
  meerDan: "More than {n}",
  meerdereGebruikers: "Multiple users",
  duizendtal: ",",
  en: " and ",
  wat: { vragenlijsten: "questionnaires", beoordelingen: "ratings", gebruikers: "users" },
  hetPakket: "the {naam}",
  kleineLetters: "alles",
  redenPast: "The {pakket} includes {inhoud}. That is enough for what you entered.",
  redenOnbekend: "The packages do not show what fits these numbers. You put the {maatwerk} together yourself; get in touch and we will look at it with you.",
  redenTeVeel: "You need more {wat} than you get with {namen}. You put the {maatwerk} together yourself, so that you get what you need.",
  redenCombinatie: "This combination does not fit in any of the packages with fixed numbers ({namen}). You put the {maatwerk} together yourself, so that you get what you need.",
  onderdelen: ONDERDELEN_EN,
};

const KIEZER_DE: KiezerTeksten = {
  taal: "de",
  kop: "Welches Paket passt zu mir?",
  intro: "Drei Fragen. Das Ergebnis ergibt sich aus dem, was in den Paketen enthalten ist.",
  pastBijJou: "Passt zu Ihnen",
  maandelijks: "monatlich",
  opAanvraag: "Auf Anfrage",
  looptijd: "Mindestens {n} Monate",
  periode: "Über welchen Zeitraum die Anzahl der Bewertungen gilt, steht nicht beim Paket. Fragen Sie in der Demo danach.",
  pakketNaam: "Das {naam}",
  andersEen: "{namen} funktioniert anders und ergibt sich nicht aus diesen drei Fragen: Sie finden es bei allen Paketen.",
  andersMeer: "{namen} funktionieren anders und ergeben sich nicht aus diesen drei Fragen: Sie finden sie bei allen Paketen.",
  demoKnop: "Demo dieses Pakets",
  alleKnop: "Alle Pakete ansehen",
  leeg: "Beantworten Sie die drei Fragen, dann sehen Sie hier, welches Paket passt.",
  nogEen: "Noch 1 Frage.",
  nogMeer: "Noch {n} Fragen.",
  vragen: { vragenlijsten: "Wie viele Fragebögen möchten Sie nutzen?", beoordelingen: "Wie viele Bewertungen erwarten Sie?", gebruikers: "Wie viele Personen arbeiten damit?" },
  enkel: { vragenlijsten: "1 Fragebogen", beoordelingen: "1 Bewertung", gebruikers: "1 Benutzer" },
  tot: "{van} bis {tot}",
  meerDan: "Mehr als {n}",
  meerdereGebruikers: "Mehrere Benutzer",
  duizendtal: ".",
  en: " und ",
  wat: { vragenlijsten: "Fragebögen", beoordelingen: "Bewertungen", gebruikers: "Benutzer" },
  hetPakket: "dem {naam}",
  kleineLetters: "eerste",
  redenPast: "Das {pakket} enthält {inhoud}. Das reicht für Ihre Angaben.",
  redenOnbekend: "Aus den Paketen lässt sich nicht ableiten, was zu diesen Mengen passt. Das {maatwerk} stellen Sie selbst zusammen; nehmen Sie Kontakt auf, dann schauen wir gemeinsam.",
  redenTeVeel: "Sie brauchen mehr {wat}, als mit {namen} möglich ist. Das {maatwerk} stellen Sie selbst zusammen, sodass Sie bekommen, was Sie brauchen.",
  redenCombinatie: "Diese Kombination ist mit {namen} nicht möglich. Das {maatwerk} stellen Sie selbst zusammen, sodass Sie bekommen, was Sie brauchen.",
  onderdelen: ONDERDELEN_DE,
};

const EN = {
  kader: KADER.en as KaderTeksten,
  meta: {
    titel: "Smileyapp · measure customer satisfaction (design proposal)",
    omschrijving: "Design proposal by ZekerFlex for a new website and app for Smileyapp: measure customer satisfaction with a smiley you swipe.",
    demoTitel: "Request a demo · Smileyapp (design proposal)",
    demoOmschrijving: "Request a demo of Smileyapp. Design proposal by ZekerFlex; the official website is smileyapp.nl.",
  },
  hero: {
    slogan: "For real reviews",
    kop: "Measure customer satisfaction with the most fun, simplest and fastest tool in the Netherlands",
    /** de drie woorden in de kop die een eigen kleur krijgen (leukste, simpelste, snelste) */
    uitgelicht: ["most fun", "simplest", "fastest"],
    vraag: "Do you want to generate more revenue by gaining more and better insight into the satisfaction of your customers, guests, visitors, employees and students?",
    knopPakketten: "Choose a package",
    knopDemo: "Request a demo",
    kernwoorden: ["Simple", "Fast", "Fun"],
  },
  hoe: {
    boven: "How it works",
    kop: "Measure. Know. Improve.",
    stappen: [
      { titel: "Measure", tekst: "People scan the QR code of your questionnaire and indicate how satisfied they are by swiping the smiley.", alt: "Smiley with a measuring stick" },
      { titel: "Know", tekst: "The results are displayed clearly in a dashboard.", alt: "Smiley with a puzzle piece and light bulbs" },
      { titel: "Improve", tekst: "So you can start improving your organisation, product or service right away!", alt: "Smiley ticking off a plan with a group" },
    ],
    vraagsoortenKop: "There are many ways to set up your questionnaire. For example, you can choose from:",
    vraagsoorten: ["1-10 rating questions", "open questions", "yes/no questions", "an empty text field to ask for feedback and details"],
  },
  probeerBlok: {
    boven: "Try it yourself",
    kop: "Swipe, and see what happens next",
    /** komt achter de tekst van stap 2 */
    intro: "Below you can see how that works, with a sample question and sample figures.",
    vraag: "How satisfied are you with your visit today?",
  },
  probeer: PROBEER_EN,
  pakketten: {
    boven: "Packages",
    kop: "Choose a package that suits you!",
    maandelijks: "per month",
    opAanvraag: "On request",
    /** met {n} */
    looptijd: "Minimum {n} months",
    demoKnop: "Demo of this package",
    labels: LABELS_EN,
    onderdelen: ONDERDELEN_EN,
    uitleg: UITLEG_EN,
  },
  kiezer: KIEZER_EN,
  klanten: {
    boven: "Experiences",
    kop: "What our customers say",
    vertaald: "Translated from Dutch",
    verhalen: "Read the stories (in Dutch)",
    case: "Case",
    /** achter de naam van de klant, voor schermlezers */
    nieuwVenster: "(opens in a new window)",
    /** in de volgorde van QUOTES in lib/voorstel/smileyapp.ts; naam en organisatie komen daaruit */
    quotes: [
      [
        "Normally, every student was asked to fill in an evaluation form in Word. Last year we took a different approach by using Smileyapp.",
        "By giving the students the freedom to rate, we collected a lot of valuable feedback. We know more about how the students experienced the minor and the various courses.",
      ],
      [
        "We use Smileyapp at, among other things, the internship fairs and external activities that we organise with the business community, such as training sessions, workshops, practical assignments, company visits and information sessions.",
        "This gives us immediate insight into what is going well, what could be improved and how we can achieve that! Of great added value if you dare to look critically at yourself and want to improve and innovate education.",
      ],
    ],
  },
  reviews: REVIEWS_EN,
  faq: {
    boven: "Questions",
    kop: "Frequently asked questions",
    /** het e-mailadres en een punt volgen */
    intro: "Is your question not listed? Send an email to",
    hoe: "How does Smileyapp work?",
    hoeAntwoord: "You can place the rating widget on any website and show your customers or guests how satisfied others are.",
    kost: "What does Smileyapp cost?",
    /** met {aantal} en {regels} */
    kostAntwoord: "There are {aantal} packages. {regels}.",
    aantallen: ["one", "two", "three", "four", "five"],
    /** met {naam}, {prijs} en {n} */
    regel: "{naam}: {prijs} per month, minimum {n} months",
    regelZonderLooptijd: "{naam}: {prijs} per month",
    regelOpAanvraag: "{naam}: price on request",
    looptijd: "What is the minimum term of a package?",
    /** met {naam} en {n} */
    looptijdRegel: "{naam}: minimum {n} months",
    /** met {naam} */
    looptijdMaatwerk: "You put the {naam} together yourself, so that you get exactly what you need.",
    soorten: "What kinds of questions can I ask?",
    /** met {lijst} en {laatste} */
    soortenAntwoord: "For example, you can choose from {lijst} or {laatste}.",
    branches: "Which sectors is Smileyapp suitable for?",
    branchesAntwoord: "Smileyapp can be used in all sectors.",
    export: "Can I export the results?",
    exportAntwoord: "Yes. You can easily export the NPS scores and average scores in a report.",
    widget: "Can I show the scores on my own website?",
    anoniem: "Is the feedback anonymous?",
    anoniemAntwoord: "There is room for (anonymous) feedback on personalised questions. That way you measure customer satisfaction in the moment, individually and honestly, because it is anonymous.",
    graag: "Why do people like giving feedback with Smileyapp?",
    graagAntwoord: "People experience the Smileyapp smiley as fun. That is why the response rate is high. Your target group likes to give feedback, especially when they see that something is done with it!",
    partner: "Can I become a partner?",
    partnerAntwoord:
      "Do you have a company or do you organise an event where you can use Smileyapp? Then become a partner and we share the revenue! How does it work? You sell Smileyapp to your customers, visitors or guests and receive part of the revenue!",
    login: "Where do I log in as a customer?",
    loginAntwoord: "Via the customer login at smileyapp.online.",
  },
  afsluiter: {
    tekst: "Would you also like to measure satisfaction in a simple, fast and fun way? Then get in touch soon!",
    knopDemo: "Request a demo",
    knopMail: "Send an email",
  },
  demo: {
    boven: "Demo",
    kop: "Request a demo",
    intro: "No boring surveys, but a simple, fast and fun tool that gives real-time insight into the wishes and needs of your target group.",
    demoVan: "Demo of",
    zoWerkt: "How Smileyapp works",
    functiesKop: "Everything is easy to set up",
    functies: [
      "Easily create questionnaires yourself",
      "Clear dashboard",
      "In your own house style",
      "Easily export the NPS scores and average scores in a report",
      "Easily collect customer responses and feedback",
      "Can be used in all sectors",
      "Measure satisfaction in a simple, fast and fun way",
    ],
    vergelijk: "Would you rather compare the packages first?",
    bekijkPakketten: "View the packages",
    alKlant: "Already a customer?",
    naarLogin: "Go to the customer login",
    formulierKop: "Plan your demo",
  },
  formulier: FORMULIER_EN,
  datum: {
    weekdagen: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    maanden: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    /** met {weekdag}, {dag} en {maand} */
    dag: "{weekdag} {dag} {maand}",
  },
};

/** Alle teksten van één vertaling. Het type volgt uit het Engels; het Duits moet er precies aan voldoen. */
export type TaalTeksten = typeof EN;

const DE: TaalTeksten = {
  kader: KADER.de,
  meta: {
    titel: "Smileyapp · Kundenzufriedenheit messen (Designvorschlag)",
    omschrijving: "Designvorschlag von ZekerFlex für eine neue Website und App von Smileyapp: Kundenzufriedenheit messen mit einem Smiley, den man wischt.",
    demoTitel: "Demo anfragen · Smileyapp (Designvorschlag)",
    demoOmschrijving: "Fragen Sie eine Demo von Smileyapp an. Designvorschlag von ZekerFlex; die offizielle Website ist smileyapp.nl.",
  },
  hero: {
    slogan: "Für echte Bewertungen",
    kop: "Kundenzufriedenheit messen mit dem sympathischsten, einfachsten und schnellsten Tool der Niederlande",
    uitgelicht: ["sympathischsten", "einfachsten", "schnellsten"],
    vraag: "Möchten Sie mehr Umsatz erzielen, weil Sie mehr und bessere Einblicke in die Zufriedenheit Ihrer Kunden, Gäste, Besucher, Mitarbeitenden und Studierenden haben?",
    knopPakketten: "Paket wählen",
    knopDemo: "Demo anfragen",
    kernwoorden: ["Einfach", "Schnell", "Sympathisch"],
  },
  hoe: {
    boven: "So funktioniert es",
    kop: "Messen. Wissen. Verbessern.",
    stappen: [
      { titel: "Messen", tekst: "Die Menschen scannen den QR-Code Ihres Fragebogens und geben an, wie zufrieden sie sind, indem sie den Smiley wischen.", alt: "Smiley mit einem Maßstab" },
      { titel: "Wissen", tekst: "Die Ergebnisse werden übersichtlich in einem Dashboard dargestellt.", alt: "Smiley mit einem Puzzleteil und Glühbirnen" },
      { titel: "Verbessern", tekst: "So können Sie sofort damit beginnen, Organisation, Produkt oder Dienstleistung zu verbessern!", alt: "Smiley, der mit einer Gruppe einen Plan abhakt" },
    ],
    vraagsoortenKop: "Es gibt viele Möglichkeiten, Ihren Fragebogen zu gestalten. Sie können zum Beispiel wählen aus:",
    vraagsoorten: ["Bewertungsfragen von 1 bis 10", "offenen Fragen", "Ja/Nein-Fragen", "einem leeren Textfeld für Feedback und Angaben"],
  },
  probeerBlok: {
    boven: "Selbst ausprobieren",
    kop: "Wischen Sie und sehen Sie, was danach passiert",
    intro: "Unten sehen Sie, wie das funktioniert, mit einer Beispielfrage und Beispielzahlen.",
    vraag: "Wie zufrieden sind Sie mit Ihrem heutigen Besuch?",
  },
  probeer: PROBEER_DE,
  pakketten: {
    boven: "Pakete",
    kop: "Wählen Sie ein Paket, das zu Ihnen passt!",
    maandelijks: "monatlich",
    opAanvraag: "Auf Anfrage",
    looptijd: "Mindestens {n} Monate",
    demoKnop: "Demo dieses Pakets",
    labels: LABELS_DE,
    onderdelen: ONDERDELEN_DE,
    uitleg: UITLEG_DE,
  },
  kiezer: KIEZER_DE,
  klanten: {
    boven: "Erfahrungen",
    kop: "Was unsere Kunden sagen",
    vertaald: "Aus dem Niederländischen übersetzt",
    verhalen: "Die Geschichten lesen (auf Niederländisch)",
    case: "Case",
    nieuwVenster: "(öffnet ein neues Fenster)",
    quotes: [
      [
        "Normalerweise wurden alle Studierenden gebeten, ein Evaluationsformular in Word auszufüllen. Im vergangenen Jahr sind wir das anders angegangen, indem wir Smileyapp eingesetzt haben.",
        "Indem wir den Studierenden die Freiheit beim Bewerten gegeben haben, haben wir viel wertvolles Feedback gesammelt. Wir wissen mehr darüber, wie die Studierenden den Minor und die verschiedenen Fächer erlebt haben.",
      ],
      [
        "Smileyapp setzen wir unter anderem bei den Praktikumsmessen und externen Aktivitäten ein, die wir gemeinsam mit der Wirtschaft organisieren, wie Trainings, Workshops, Praxisaufträge, Betriebsbesuche und Informationsveranstaltungen.",
        "So erhalten wir sofort Einblick, was gut läuft, welche Verbesserungspunkte es gibt und wie wir das umsetzen können! Von großem Mehrwert, wenn man sich traut, kritisch auf sich selbst zu schauen, und die Bildung verbessern und erneuern will.",
      ],
    ],
  },
  reviews: REVIEWS_DE,
  faq: {
    boven: "Fragen",
    kop: "Häufig gestellte Fragen",
    intro: "Ist Ihre Frage nicht dabei? Schreiben Sie eine E-Mail an",
    hoe: "Wie funktioniert Smileyapp?",
    hoeAntwoord: "Das Rating-Widget können Sie auf jeder beliebigen Website platzieren und so Ihren Kunden oder Gästen zeigen, wie zufrieden andere sind.",
    kost: "Was kostet Smileyapp?",
    kostAntwoord: "Es gibt {aantal} Pakete. {regels}.",
    aantallen: ["ein", "zwei", "drei", "vier", "fünf"],
    regel: "{naam}: {prijs} monatlich, mindestens {n} Monate",
    regelZonderLooptijd: "{naam}: {prijs} monatlich",
    regelOpAanvraag: "{naam}: Preis auf Anfrage",
    looptijd: "Wie lange läuft ein Paket mindestens?",
    looptijdRegel: "{naam}: mindestens {n} Monate",
    looptijdMaatwerk: "Das {naam} stellen Sie selbst zusammen, sodass Sie genau das bekommen, was Sie brauchen.",
    soorten: "Welche Arten von Fragen kann ich stellen?",
    soortenAntwoord: "Sie können zum Beispiel wählen aus {lijst} oder {laatste}.",
    branches: "Für welche Branchen ist Smileyapp geeignet?",
    branchesAntwoord: "Smileyapp ist für alle Branchen einsetzbar.",
    export: "Kann ich die Ergebnisse exportieren?",
    exportAntwoord: "Ja. Sie können die NPS-Werte und Durchschnittswerte einfach in einem Bericht exportieren.",
    widget: "Kann ich die Bewertungen auf meiner eigenen Website zeigen?",
    anoniem: "Ist das Feedback anonym?",
    anoniemAntwoord: "Es gibt Raum für (anonymes) Feedback zu personalisierten Fragen. So messen Sie die Kundenzufriedenheit im Moment, individuell und ehrlich, weil es anonym ist.",
    graag: "Warum geben Menschen mit Smileyapp gern Feedback?",
    graagAntwoord:
      "Die Menschen finden den Smiley von Smileyapp sympathisch. Dadurch ist die Rücklaufquote hoch. Ihre Zielgruppe gibt gern Feedback, vor allem, wenn sie sieht, dass etwas damit gemacht wird!",
    partner: "Kann ich Partner werden?",
    partnerAntwoord:
      "Haben Sie ein Unternehmen oder organisieren Sie eine Veranstaltung, bei der Sie Smileyapp einsetzen können? Dann werden Sie Partner und wir teilen den Erlös! Wie funktioniert es? Sie verkaufen Smileyapp an Ihre Kunden, Besucher oder Gäste und erhalten einen Teil des Erlöses!",
    login: "Wo melde ich mich als Kunde an?",
    loginAntwoord: "Über den Kundenlogin auf smileyapp.online.",
  },
  afsluiter: {
    tekst: "Möchten auch Sie die Zufriedenheit auf einfache, schnelle und sympathische Weise messen? Dann nehmen Sie schnell Kontakt auf!",
    knopDemo: "Demo anfragen",
    knopMail: "E-Mail senden",
  },
  demo: {
    boven: "Demo",
    kop: "Demo anfragen",
    intro: "Keine langweiligen Umfragen, sondern ein einfaches, schnelles und sympathisches Tool, das in Echtzeit Einblick in die Wünsche und Bedürfnisse Ihrer Zielgruppe gibt.",
    demoVan: "Demo von",
    zoWerkt: "So funktioniert Smileyapp",
    functiesKop: "Alles einfach einzustellen",
    functies: [
      "Fragebögen einfach selbst erstellen",
      "Übersichtliches Dashboard",
      "Im eigenen Corporate Design",
      "NPS-Werte und Durchschnittswerte einfach in einem Bericht exportieren",
      "Kundenreaktionen und Feedback einfach sammeln",
      "Einsetzbar für alle Branchen",
      "Die Zufriedenheit auf einfache, schnelle und sympathische Weise messen",
    ],
    vergelijk: "Möchten Sie lieber erst die Pakete vergleichen?",
    bekijkPakketten: "Pakete ansehen",
    alKlant: "Schon Kunde?",
    naarLogin: "Zum Kundenlogin",
    formulierKop: "Planen Sie Ihre Demo",
  },
  formulier: FORMULIER_DE,
  datum: {
    weekdagen: ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
    maanden: ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"],
    dag: "{weekdag}, {dag}. {maand}",
  },
};

export const TEKSTEN: Record<Vertaling, TaalTeksten> = { en: EN, de: DE };

// ---- hulpjes die een tekst met gegevens combineren ---------------------------

export interface Vertaald {
  tekst: string;
  /** false: niet in de tabel (door het team aangepast), dus nog Nederlands */
  vertaald: boolean;
}

/** Zoekt een Nederlandse tekst op in een vaste vertaaltabel. Staat hij er niet in, dan blijft hij Nederlands. */
export function vertaal(tabel: Readonly<Record<string, string>>, nl: string): Vertaald {
  const sleutel = nl.trim();
  return Object.hasOwn(tabel, sleutel) ? { tekst: tabel[sleutel] ?? nl, vertaald: true } : { tekst: nl, vertaald: false };
}

/** De prijs van een pakket in de taal: het bedrag uit het pakket zelf, of "op aanvraag". */
export const prijsTaal = (p: Pick<Pakket, "prijs">, taal: Vertaling) => (p.prijs === null ? TEKSTEN[taal].pakketten.opAanvraag : euroTaal(p.prijs, taal));

/** "Minimum 12 months"; leeg als het pakket geen minimale looptijd noemt. */
export const looptijdTaal = (p: Pick<Pakket, "minimaalMaanden">, taal: Vertaling) =>
  p.minimaalMaanden === null ? "" : vul(TEKSTEN[taal].pakketten.looptijd, { n: p.minimaalMaanden });

/** Een dag uit de keuzelijst ("Monday 23 November"): een vaste dag zonder tijd, dus de tijdzone speelt geen rol. */
export function dagTaal(iso: string, taal: Vertaling): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const t = TEKSTEN[taal].datum;
  return vul(t.dag, { weekdag: t.weekdagen[d.getUTCDay()] ?? "", dag: d.getUTCDate(), maand: t.maanden[d.getUTCMonth()] ?? "" });
}

/**
 * De veelgestelde vragen in de taal. Dezelfde vragen als veelgesteld() in lib/voorstel/smileyapp.ts, met dezelfde
 * gegevens: de antwoorden over prijs en looptijd volgen de pakketten zoals de site ze nu toont. De zin over het
 * animatiefilmpje ontbreekt, want dat staat niet op deze verkorte pagina.
 */
export function veelgesteldTaal(pakketten: readonly Pakket[], taal: Vertaling): Vraag[] {
  const t = TEKSTEN[taal];
  const f = t.faq;
  const regel = (p: Pakket) =>
    p.prijs === null
      ? vul(f.regelOpAanvraag, { naam: p.naam })
      : vul(p.minimaalMaanden === null ? f.regelZonderLooptijd : f.regel, { naam: p.naam, prijs: euroTaal(p.prijs, taal), n: p.minimaalMaanden ?? "" });
  const metLooptijd = pakketten.filter((p) => p.minimaalMaanden !== null).map((p) => vul(f.looptijdRegel, { naam: p.naam, n: p.minimaalMaanden ?? "" }));
  const maatwerk = pakketten.find((p) => p.prijs === null && p.id === "maatwerk");
  const looptijd = [metLooptijd.length ? `${metLooptijd.join(". ")}.` : "", maatwerk ? vul(f.looptijdMaatwerk, { naam: maatwerk.naam }) : ""].filter(Boolean).join(" ");
  const soorten = t.hoe.vraagsoorten;
  return [
    { vraag: f.hoe, antwoord: `${t.hoe.stappen[0]?.tekst ?? ""} ${t.hoe.stappen[1]?.tekst ?? ""} ${t.hoe.stappen[2]?.tekst ?? ""} ${f.hoeAntwoord}` },
    { vraag: f.kost, antwoord: vul(f.kostAntwoord, { aantal: f.aantallen[pakketten.length - 1] ?? pakketten.length, regels: pakketten.map(regel).join(". ") }) },
    { vraag: f.looptijd, antwoord: looptijd },
    { vraag: f.soorten, antwoord: vul(f.soortenAntwoord, { lijst: soorten.slice(0, -1).join(", "), laatste: soorten[soorten.length - 1] ?? "" }) },
    { vraag: f.branches, antwoord: f.branchesAntwoord },
    { vraag: f.export, antwoord: f.exportAntwoord },
    { vraag: f.widget, antwoord: f.hoeAntwoord },
    { vraag: f.anoniem, antwoord: f.anoniemAntwoord },
    { vraag: f.graag, antwoord: f.graagAntwoord },
    { vraag: f.partner, antwoord: f.partnerAntwoord },
    { vraag: f.login, antwoord: f.loginAntwoord },
  ].filter((v) => v.antwoord.trim() !== "");
}
