import type { Pakket, Vraag } from "@/lib/voorstel/smileyapp";
import type { ReviewTeksten } from "@/lib/voorstel/smileyapp-review-regels";
import { KADER, TALEN, VERTALINGEN, euroTaal, isTaal, type KaderTeksten, type Taal, type Vertaling } from "@/lib/voorstel/smileyapp-taal";
import { BRANCHE_LIJST } from "@/lib/voorstel/smileyapp-branches";
import { SOORT_SLEUTEL, type KeuzeVraag } from "@/lib/voorstel/smileyapp-samensteller";
import type { Rij } from "@/lib/voorstel/smileyapp-vergelijk-regels";
import { vul, type FormulierTeksten, type GeslotenTeksten, type KiezerTeksten, type ProbeerTeksten, type RekenTeksten, type SamenstelTeksten, type VergelijkTeksten } from "@/lib/voorstel/smileyapp-teksten";

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

// ---- deel 6b: de rest van de site in het Engels en het Duits -------------------

/** De tekst van één branchepagina (lib/voorstel/smileyapp-branches.ts): dezelfde vorm, vertaald. De vragen blijven voorbeelden. */
export interface BrancheTekst {
  naam: string;
  kop: string;
  intro: string[];
  momenten: string[];
  /** in de volgorde van de Nederlandse voorbeeldvragen; de soort van elke vraag komt uit de Nederlandse gegevens */
  vragen: string[];
}

const BRANCHES_EN: Record<string, BrancheTekst> = {
  horeca: {
    naam: "Hospitality",
    kop: "Measure hospitality in restaurants, cafés and hotels",
    intro: [
      "A guest who says at the table that everything was fine does not always tell you what they really thought. With a short questionnaire on their own phone, a guest gives their opinion in the moment itself.",
      "You put a QR code on the table, on the bill or at the exit. The guest scans it, swipes the smiley and is done in no time.",
    ],
    momenten: ["At the table, after the main course", "When paying the bill", "At the exit or the cloakroom", "After takeaway or delivery, with a QR code on the packaging"],
    vragen: [
      "How satisfied are you with your visit today?",
      "What did you think of the food and drinks?",
      "How welcoming did you find our service?",
      "Would you recommend us to friends or family?",
      "What can we do better next time?",
    ],
  },
  onderwijs: {
    naam: "Education",
    kop: "Let students and participants give their rating",
    intro: [
      "An evaluation after a course, a minor or an activity yields more when students fill it in straight away and without any fuss. Swiping a smiley takes a few seconds.",
      "You hang the QR code in the classroom or put it on the last slide. That way the whole group can take part, not just those who stay behind afterwards.",
    ],
    momenten: ["At the end of a lesson, course or minor", "After an internship fair or open day", "After a workshop, training session or company visit", "After an information session"],
    vragen: [
      "How did you experience this course?",
      "How clear was the explanation?",
      "Did the content match what you expected?",
      "What should we definitely keep as it is?",
      "Is there anything else you would like to tell us, or would you like us to contact you? Leave it here.",
    ],
  },
  zorg: {
    naam: "Healthcare",
    kop: "Collect the experiences of clients and visitors",
    intro: [
      "Someone who has just seen a practitioner or been at the desk still remembers exactly how it went. A short questionnaire in the waiting room or at the exit asks about it at that moment.",
      "Keep the questions general and do not ask for medical details: it is about the experience, not the medical file.",
    ],
    momenten: ["In the waiting room, after the appointment", "At the desk or the exit", "After a course of treatment", "After a home visit, with a QR code on a card"],
    vragen: [
      "How satisfied are you with your appointment today?",
      "How friendly was your welcome?",
      "Was the explanation you received clear?",
      "Were you seen on time?",
      "What would have made your visit more pleasant?",
    ],
  },
  winkel: {
    naam: "Shops and retail",
    kop: "Know what customers think of your shop",
    intro: [
      "A customer who walks out of the shop rarely tells you why they did or did not buy something. With a QR code at the checkout or on the receipt, you ask while they still remember.",
      "You can also include the QR code in the parcel of an online order.",
    ],
    momenten: ["At the checkout, after paying", "On the receipt or the bag", "At the fitting room or the service desk", "In the parcel of an online order"],
    vragen: [
      "How satisfied are you with your visit to our shop?",
      "How well were you helped by our staff?",
      "Did you find what you were looking for?",
      "What did you miss in our range?",
      "Would you like a reply from us? Then leave your details here.",
    ],
  },
  evenementen: {
    naam: "Events",
    kop: "Feedback from visitors, while your event is still on",
    intro: [
      "After an event everyone has gone home again and a survey by email often no longer gets through. With a QR code on the grounds, on a screen or on the wristband, you ask while visitors are still there.",
      "For a (multi-day) event or several locations there is the Maatwerk Pakket (the custom package), which you put together yourself.",
    ],
    momenten: ["At the exit", "After a performance, session or speaker", "At the bar or the food court", "At the end of each day of a multi-day event"],
    vragen: [
      "How satisfied are you with the event?",
      "What did you think of the programme?",
      "How did you find the organisation on the grounds?",
      "Will you come again next time?",
      "What must not be missing next year?",
    ],
  },
};

const BRANCHES_DE: Record<string, BrancheTekst> = {
  horeca: {
    naam: "Gastronomie",
    kop: "Gastfreundschaft in der Gastronomie messen",
    intro: [
      "Ein Gast, der am Tisch sagt, dass alles in Ordnung war, erzählt nicht immer, was er wirklich dachte. Mit einem kurzen Fragebogen auf dem eigenen Smartphone gibt ein Gast seine Meinung im Moment selbst ab.",
      "Sie stellen einen QR-Code auf den Tisch, drucken ihn auf die Rechnung oder platzieren ihn am Ausgang. Der Gast scannt, wischt den Smiley und ist im Nu fertig.",
    ],
    momenten: ["Am Tisch, nach dem Hauptgang", "Beim Bezahlen", "Am Ausgang oder an der Garderobe", "Nach dem Abholen oder Liefern, mit einem QR-Code auf der Verpackung"],
    vragen: [
      "Wie zufrieden sind Sie mit Ihrem heutigen Besuch?",
      "Wie fanden Sie Essen und Getränke?",
      "Wie gastfreundlich fanden Sie unseren Service?",
      "Würden Sie uns Freunden oder Familie empfehlen?",
      "Was können wir beim nächsten Mal besser machen?",
    ],
  },
  onderwijs: {
    naam: "Bildung",
    kop: "Studierende und Teilnehmende bewerten lassen",
    intro: [
      "Eine Evaluation nach einem Fach, einem Minor oder einer Aktivität bringt mehr, wenn Studierende sie sofort und ohne Aufwand ausfüllen. Einen Smiley zu wischen dauert ein paar Sekunden.",
      "Sie hängen den QR-Code im Raum auf oder setzen ihn auf die letzte Folie. So kann die ganze Gruppe mitmachen, nicht nur, wer danach noch bleibt.",
    ],
    momenten: [
      "Am Ende einer Unterrichtsstunde, eines Fachs oder eines Minors",
      "Nach einer Praktikumsmesse oder einem Tag der offenen Tür",
      "Nach einem Workshop, einem Training oder einem Betriebsbesuch",
      "Nach einer Informationsveranstaltung",
    ],
    vragen: [
      "Wie haben Sie dieses Fach erlebt?",
      "Wie verständlich war die Erklärung?",
      "Entsprach der Inhalt Ihren Erwartungen?",
      "Was sollten wir unbedingt so beibehalten?",
      "Möchten Sie uns noch etwas mitteilen oder sollen wir Sie kontaktieren? Schreiben Sie es hier.",
    ],
  },
  zorg: {
    naam: "Gesundheitswesen",
    kop: "Erfahrungen von Klienten und Besuchern einholen",
    intro: [
      "Wer gerade in einer Behandlung oder am Empfang war, weiß noch genau, wie es war. Ein kurzer Fragebogen im Wartezimmer oder am Ausgang fragt in diesem Moment danach.",
      "Halten Sie die Fragen allgemein und fragen Sie nicht nach medizinischen Daten: Es geht um die Erfahrung, nicht um die Akte.",
    ],
    momenten: ["Im Wartezimmer, nach dem Termin", "Am Empfang oder am Ausgang", "Nach einer Behandlungsreihe", "Nach einem Hausbesuch, mit einem QR-Code auf einer Karte"],
    vragen: [
      "Wie zufrieden sind Sie mit Ihrem heutigen Termin?",
      "Wie freundlich wurden Sie empfangen?",
      "War die Erklärung, die Sie erhalten haben, verständlich?",
      "Kamen Sie pünktlich an die Reihe?",
      "Was hätte Ihren Besuch angenehmer gemacht?",
    ],
  },
  winkel: {
    naam: "Geschäft und Einzelhandel",
    kop: "Wissen, was Kunden von Ihrem Geschäft halten",
    intro: [
      "Ein Kunde, der das Geschäft verlässt, erzählt selten, warum er etwas gekauft hat oder nicht. Mit einem QR-Code an der Kasse oder auf dem Kassenbon fragen Sie in dem Moment, in dem er es noch weiß.",
      "Den QR-Code können Sie auch dem Paket einer Online-Bestellung beilegen.",
    ],
    momenten: ["An der Kasse, nach dem Bezahlen", "Auf dem Kassenbon oder der Tüte", "An der Umkleidekabine oder am Serviceschalter", "Im Paket einer Online-Bestellung"],
    vragen: [
      "Wie zufrieden sind Sie mit Ihrem Besuch in unserem Geschäft?",
      "Wie gut wurden Sie von unseren Mitarbeitenden beraten?",
      "Haben Sie gefunden, was Sie gesucht haben?",
      "Was haben Sie in unserem Sortiment vermisst?",
      "Möchten Sie eine Antwort von uns? Dann hinterlassen Sie hier Ihre Angaben.",
    ],
  },
  evenementen: {
    naam: "Veranstaltungen",
    kop: "Feedback von Besuchern, noch während Ihrer Veranstaltung",
    intro: [
      "Nach einer Veranstaltung sind alle wieder zu Hause und eine Umfrage per E-Mail kommt oft nicht mehr an. Mit einem QR-Code auf dem Gelände, auf einem Bildschirm oder auf dem Armband fragen Sie, solange die Besucher noch da sind.",
      "Für eine (mehrtägige) Veranstaltung oder mehrere Standorte gibt es das Maatwerk Pakket (das Paket nach Maß), das Sie selbst zusammenstellen.",
    ],
    momenten: ["Am Ausgang", "Nach einem Auftritt, einer Session oder einem Vortrag", "An der Bar oder im Gastrobereich", "Am Ende jedes Tages bei einer mehrtägigen Veranstaltung"],
    vragen: [
      "Wie zufrieden sind Sie mit der Veranstaltung?",
      "Wie fanden Sie das Programm?",
      "Wie fanden Sie die Organisation auf dem Gelände?",
      "Kommen Sie beim nächsten Mal wieder?",
      "Was darf im nächsten Jahr nicht fehlen?",
    ],
  },
};

/** De uitwerking van een klantverhaal (lib/voorstel/smileyapp-klanten.ts), per id. De quote zelf blijft Nederlands. */
export interface VerhaalTekst {
  gebruik: string;
  eerst?: string;
  meten: string[];
}

const VERHALEN_EN: Record<string, VerhaalTekst> = {
  hanzehogeschool: {
    gebruik: "Hanzehogeschool has students rate their minor and courses with Smileyapp.",
    eerst: "Every student was asked to fill in an evaluation form in Word.",
    meten: ["How the students experienced the minor", "How the students experienced the various courses"],
  },
  "alfa-college": {
    gebruik: "Alfa College uses Smileyapp at, among other things, internship fairs and external activities that it organises with the business community.",
    meten: ["Internship fairs", "Training sessions and workshops", "Practical assignments", "Company visits", "Information sessions"],
  },
};

const VERHALEN_DE: Record<string, VerhaalTekst> = {
  hanzehogeschool: {
    gebruik: "Die Hanzehogeschool lässt Studierende mit Smileyapp ihren Minor und ihre Fächer bewerten.",
    eerst: "Alle Studierenden wurden gebeten, ein Evaluationsformular in Word auszufüllen.",
    meten: ["Wie die Studierenden den Minor erlebt haben", "Wie die Studierenden die verschiedenen Fächer erlebt haben"],
  },
  "alfa-college": {
    gebruik: "Das Alfa College setzt Smileyapp unter anderem bei Praktikumsmessen und bei externen Aktivitäten ein, die es gemeinsam mit der Wirtschaft organisiert.",
    meten: ["Praktikumsmessen", "Trainings und Workshops", "Praxisaufträge", "Betriebsbesuche", "Informationsveranstaltungen"],
  },
};

const SAMENSTEL_EN: SamenstelTeksten = {
  boven: "Build it yourself",
  kop: "Build your own questionnaire",
  intro: "Choose up to {max} sample questions and, if you like, add one question of your own. You can see straight away what it looks like on a phone.",
  kiesKop: "Choose your questions",
  voorbeeld: "Example",
  voorbeeldUitleg: "All questions in this list are examples by ZekerFlex, not questions from a Smileyapp customer. In your own dashboard you can change everything.",
  gekozen: "{n} of {max} chosen",
  vol: "You have chosen {max}. Remove one first to choose another.",
  eigenLabel: "Your own question",
  eigenUitleg: "At most {max} characters; now {n}.",
  eigenSoort: "Own question",
  telefoonKop: "This is what your questionnaire looks like",
  telefoonUitleg: "An example: what you choose or type here stays in your own browser; nothing is stored or sent.",
  leeg: "Choose a question and you will see it here.",
  stap: "Question {n} of {totaal}",
  vorige: "Previous",
  volgende: "Next",
  klaar: "Done",
  bedankt: "Thank you!",
  opnieuw: "Once more",
  ja: "Yes",
  nee: "No",
  antwoord: "Type your answer here",
  score: "{score} out of 10",
  kiesCijfer: "Pick a number from 1 to 10",
  demoKnop: "Request a demo with this questionnaire",
  demoUitleg: "Your selection goes along to the demo form and appears there in the message field. You can still change it there.",
  eerstKiezen: "First choose a question or type your own question.",
  berichtKop: "My questionnaire (put together on the website):",
  berichtEigen: "Own question: {vraag}",
  demoKaart: "With your questionnaire",
  demoKaartUitleg: "Your questions are in the message field of the form. You can still change them there.",
  blokBoven: "Build it yourself",
  blokKop: "Which questions would you ask?",
  blokTekst: "Choose a few sample questions, add a question of your own and see what it looks like on a phone.",
  blokKnop: "Build your questionnaire",
  soorten: { rating: "1-10 rating", open: "Open question", janee: "Yes/no", tekstveld: "Empty text field" },
};

const SAMENSTEL_DE: SamenstelTeksten = {
  boven: "Selbst zusammenstellen",
  kop: "Stellen Sie Ihren eigenen Fragebogen zusammen",
  intro: "Wählen Sie höchstens {max} Beispielfragen und fügen Sie, wenn Sie möchten, eine eigene Frage hinzu. Sie sehen sofort, wie es auf einem Smartphone aussieht.",
  kiesKop: "Wählen Sie Ihre Fragen",
  voorbeeld: "Beispiel",
  voorbeeldUitleg: "Alle Fragen in dieser Liste sind Beispiele von ZekerFlex, keine Fragen eines Kunden von Smileyapp. In Ihrem eigenen Dashboard passen Sie alles an.",
  gekozen: "{n} von {max} gewählt",
  vol: "Sie haben {max} gewählt. Entfernen Sie zuerst eine Frage, um eine andere zu wählen.",
  eigenLabel: "Ihre eigene Frage",
  eigenUitleg: "Höchstens {max} Zeichen; jetzt {n}.",
  eigenSoort: "Eigene Frage",
  telefoonKop: "So sieht Ihr Fragebogen aus",
  telefoonUitleg: "Ein Beispiel: Was Sie hier wählen oder eingeben, bleibt in Ihrem eigenen Browser, es wird nichts gespeichert oder gesendet.",
  leeg: "Wählen Sie eine Frage, dann sehen Sie sie hier.",
  stap: "Frage {n} von {totaal}",
  vorige: "Zurück",
  volgende: "Weiter",
  klaar: "Fertig",
  bedankt: "Vielen Dank!",
  opnieuw: "Noch einmal",
  ja: "Ja",
  nee: "Nein",
  antwoord: "Geben Sie hier Ihre Antwort ein",
  score: "{score} von 10",
  kiesCijfer: "Wählen Sie eine Zahl von 1 bis 10",
  demoKnop: "Demo mit diesem Fragebogen anfragen",
  demoUitleg: "Ihre Auswahl wird in das Demo-Formular übernommen und steht dort im Nachrichtenfeld. Sie können sie dort noch ändern.",
  eerstKiezen: "Wählen Sie zuerst eine Frage oder geben Sie Ihre eigene Frage ein.",
  berichtKop: "Mein Fragebogen (auf der Website zusammengestellt):",
  berichtEigen: "Eigene Frage: {vraag}",
  demoKaart: "Mit Ihrem Fragebogen",
  demoKaartUitleg: "Ihre Fragen stehen im Nachrichtenfeld des Formulars. Sie können sie dort noch ändern.",
  blokBoven: "Selbst zusammenstellen",
  blokKop: "Welche Fragen würden Sie stellen?",
  blokTekst: "Wählen Sie ein paar Beispielfragen, fügen Sie eine eigene Frage hinzu und sehen Sie, wie es auf einem Smartphone aussieht.",
  blokKnop: "Fragebogen zusammenstellen",
  soorten: { rating: "Bewertung 1-10", open: "Offene Frage", janee: "Ja/Nein", tekstveld: "Leeres Textfeld" },
};

/** De rekenhulp. Hier staat nergens een percentage: {p} is wat het team zelf in het beheer invulde. */
const REKEN_EN: RekenTeksten = {
  boven: "Calculator",
  kop: "How many responses can you expect?",
  label: "How many customers or guests do you have per month?",
  uitleg: "A whole number from 1 to {max}.",
  fout: "Enter a whole number from 1 to {max}.",
  leeg: "Enter a number and you will see the estimate here.",
  uitkomst: "About {n} responses per month",
  uitkomstEen: "About 1 response per month",
  gerekend: "Calculated with a response rate of {p}%, entered by the Smileyapp team.",
  bron: "Where this figure comes from:",
  schatting: "An estimate, not a promise.",
  duizendtal: ",",
};

const REKEN_DE: RekenTeksten = {
  boven: "Rechenhilfe",
  kop: "Wie viele Antworten können Sie erwarten?",
  label: "Wie viele Kunden oder Gäste haben Sie pro Monat?",
  uitleg: "Eine ganze Zahl von 1 bis {max}.",
  fout: "Geben Sie eine ganze Zahl von 1 bis {max} ein.",
  leeg: "Geben Sie eine Zahl ein, dann sehen Sie hier die Schätzung.",
  uitkomst: "Ungefähr {n} Antworten pro Monat",
  uitkomstEen: "Ungefähr 1 Antwort pro Monat",
  gerekend: "Berechnet mit einer Rücklaufquote von {p} %, eingetragen vom Team von Smileyapp.",
  bron: "Woher diese Zahl stammt:",
  schatting: "Eine Schätzung, kein Versprechen.",
  duizendtal: ".",
};

/**
 * De vergelijking met papier. `rijen`: de vertaling van elke standaardrij (lib/voorstel/smileyapp-vergelijk-regels.ts,
 * STANDAARD_RIJEN) per id. De kolom Smileyapp is de vertaling van de Nederlandse bronzin, niets erbij.
 */
const VERGELIJK_EN: VergelijkTeksten = {
  boven: "Compare",
  kop: "Smileyapp or a paper survey?",
  intro: "What is the difference in everyday use? Below you can see them side by side.",
  uitleg: "The Smileyapp column contains sentences from smileyapp.nl. The paper column only describes how a paper form works.",
  kolomKenmerk: "Topic",
  kolomSmileyapp: "Smileyapp",
  kolomPapier: "Paper survey",
  tabelNaam: "Smileyapp and a paper survey side by side",
  slot: "Curious how it works for your organisation?",
  demoKnop: "Request a demo",
  pakkettenKnop: "View the packages",
  bijPakketten: "Do you work with paper forms at the moment?",
  link: "Smileyapp or a paper survey?",
  rijen: {
    invullen: {
      kenmerk: "Filling in",
      smileyapp: "People scan the QR code of your questionnaire and indicate how satisfied they are by swiping the smiley.",
      papier: "People fill in the form with a pen.",
    },
    resultaten: { kenmerk: "Viewing results", smileyapp: "The results are displayed clearly in a dashboard.", papier: "You count the answers by hand." },
    maken: { kenmerk: "Creating a questionnaire", smileyapp: "Easily create questionnaires yourself", papier: "You have to print the forms and collect them." },
    rapport: { kenmerk: "Report", smileyapp: "Easily export the NPS scores and average scores in a report", papier: "You make a report yourself from the answers you counted." },
    huisstijl: { kenmerk: "House style", smileyapp: "In your own house style", papier: "You design the form yourself." },
    vraagsoorten: {
      kenmerk: "Kinds of questions",
      smileyapp:
        "There are many ways to set up your questionnaire. For example, you can choose from 1-10 rating questions, open questions, yes/no questions or add an empty text field to ask for feedback and details.",
      papier: "You decide yourself which questions are on the form.",
    },
    delen: {
      kenmerk: "Showing the results",
      smileyapp: "You can place the rating widget on any website and show your customers or guests how satisfied others are.",
      papier: "You share the results yourself.",
    },
    anoniem: { kenmerk: "Anonymous", smileyapp: "There is also room for (anonymous) feedback on personalised questions.", papier: "A form without a name is anonymous too." },
  },
};

const VERGELIJK_DE: VergelijkTeksten = {
  boven: "Vergleichen",
  kop: "Smileyapp oder eine Umfrage auf Papier?",
  intro: "Was ist der Unterschied im täglichen Gebrauch? Unten sehen Sie beide nebeneinander.",
  uitleg: "In der Spalte Smileyapp stehen Sätze von smileyapp.nl. Die Spalte Papier beschreibt nur, wie ein Papierformular funktioniert.",
  kolomKenmerk: "Thema",
  kolomSmileyapp: "Smileyapp",
  kolomPapier: "Umfrage auf Papier",
  tabelNaam: "Smileyapp und eine Umfrage auf Papier nebeneinander",
  slot: "Neugierig, wie es für Ihre Organisation funktioniert?",
  demoKnop: "Demo anfragen",
  pakkettenKnop: "Pakete ansehen",
  bijPakketten: "Arbeiten Sie derzeit mit Papierformularen?",
  link: "Smileyapp oder eine Umfrage auf Papier?",
  rijen: {
    invullen: {
      kenmerk: "Ausfüllen",
      smileyapp: "Die Menschen scannen den QR-Code Ihres Fragebogens und geben an, wie zufrieden sie sind, indem sie den Smiley wischen.",
      papier: "Die Menschen füllen das Formular mit einem Stift aus.",
    },
    resultaten: { kenmerk: "Ergebnisse ansehen", smileyapp: "Die Ergebnisse werden übersichtlich in einem Dashboard dargestellt.", papier: "Sie zählen die Antworten von Hand." },
    maken: { kenmerk: "Fragebogen erstellen", smileyapp: "Fragebögen einfach selbst erstellen", papier: "Sie müssen die Formulare drucken und einsammeln." },
    rapport: { kenmerk: "Bericht", smileyapp: "NPS-Werte und Durchschnittswerte einfach in einem Bericht exportieren", papier: "Einen Bericht erstellen Sie selbst aus den gezählten Antworten." },
    huisstijl: { kenmerk: "Corporate Design", smileyapp: "Im eigenen Corporate Design", papier: "Das Formular gestalten Sie selbst." },
    vraagsoorten: {
      kenmerk: "Arten von Fragen",
      smileyapp:
        "Es gibt viele Möglichkeiten, Ihren Fragebogen zu gestalten. Sie können zum Beispiel wählen aus Bewertungsfragen von 1 bis 10, offenen Fragen, Ja/Nein-Fragen oder ein leeres Textfeld hinzufügen, um nach Feedback und Angaben zu fragen.",
      papier: "Sie bestimmen selbst, welche Fragen auf dem Formular stehen.",
    },
    delen: {
      kenmerk: "Ergebnisse zeigen",
      smileyapp: "Das Rating-Widget können Sie auf jeder beliebigen Website platzieren und so Ihren Kunden oder Gästen zeigen, wie zufrieden andere sind.",
      papier: "Die Ergebnisse teilen Sie selbst.",
    },
    anoniem: { kenmerk: "Anonym", smileyapp: "Außerdem gibt es Raum für (anonymes) Feedback zu personalisierten Fragen.", papier: "Ein Formular ohne Namen ist ebenfalls anonym." },
  },
};

/** Het contactformulier, dat in dit voorstel dicht staat. De namen van de pakketten blijven zoals ze zijn. */
const GESLOTEN_EN: GeslotenTeksten = {
  dicht: "This form is closed as long as this is a design proposal: nothing is sent or stored. Email your question to",
  legenda: "Contact form (closed in this proposal)",
  voornaam: "First name",
  achternaam: "Last name",
  email: "Email address",
  telefoon: "Phone number",
  bedrijf: "Company name",
  interesse: "I am interested in",
  keuze: "Make a choice",
  vraag: "Your question or comment",
  verstuur: "Send (closed)",
  mail: "Email {email}",
  interesses: { Partnerprogramma: "Partner programme", Anders: "Other" },
};

const GESLOTEN_DE: GeslotenTeksten = {
  dicht: "Dieses Formular ist geschlossen, solange dies ein Designvorschlag ist: Es wird nichts gesendet oder gespeichert. Senden Sie Ihre Frage per E-Mail an",
  legenda: "Kontaktformular (in diesem Vorschlag geschlossen)",
  voornaam: "Vorname",
  achternaam: "Nachname",
  email: "E-Mail-Adresse",
  telefoon: "Telefonnummer",
  bedrijf: "Firmenname",
  interesse: "Ich interessiere mich für",
  keuze: "Bitte wählen",
  vraag: "Ihre Frage oder Anmerkung",
  verstuur: "Senden (geschlossen)",
  mail: "E-Mail an {email}",
  interesses: { Partnerprogramma: "Partnerprogramm", Anders: "Sonstiges" },
};

const EN = {
  kader: KADER.en as KaderTeksten,
  meta: {
    titel: "Smileyapp · measure customer satisfaction (design proposal)",
    omschrijving: "Design proposal by ZekerFlex for a new website and app for Smileyapp: measure customer satisfaction with a smiley you swipe.",
    demoTitel: "Request a demo · Smileyapp (design proposal)",
    demoOmschrijving: "Request a demo of Smileyapp. Design proposal by ZekerFlex; the official website is smileyapp.nl.",
    branchesTitel: "Sectors · Smileyapp (design proposal)",
    branchesOmschrijving: "Five examples of where you can measure with Smileyapp and what you can ask. Design proposal by ZekerFlex; the official website is smileyapp.nl.",
    /** met {kop}: de kop van de branchepagina */
    brancheTitel: "{kop} · Smileyapp (design proposal)",
    klantenTitel: "Customer stories · Smileyapp (design proposal)",
    klantenOmschrijving: "Two customers tell in their own words what they use Smileyapp for. Design proposal by ZekerFlex; the official website is smileyapp.nl.",
    contactTitel: "Contact · Smileyapp (design proposal)",
    contactOmschrijving: "The contact details of Smileyapp. Design proposal by ZekerFlex; the official website is smileyapp.nl.",
    partnerTitel: "Become a partner · Smileyapp (design proposal)",
    partnerOmschrijving: "Become a partner of Smileyapp. Design proposal by ZekerFlex; the official website is smileyapp.nl.",
    samenstellenTitel: "Build your own questionnaire · Smileyapp (design proposal)",
    samenstellenOmschrijving: "Choose sample questions and see what your questionnaire looks like on a phone. Design proposal by ZekerFlex; the official website is smileyapp.nl.",
    vergelijkenTitel: "Smileyapp or a paper survey? · Smileyapp (design proposal)",
    vergelijkenOmschrijving: "Smileyapp and a paper survey side by side. Design proposal by ZekerFlex; the official website is smileyapp.nl.",
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
    verhalen: "Read the stories",
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
  // ---- deel 6b: de rest van de site ----
  /** de omlijsting van het overzicht en van één branchepagina */
  branchePagina: {
    boven: "Sectors",
    kop: "Smileyapp can be used in all sectors",
    sub: "Five examples of where you can measure and what you can ask.",
    bekijk: "View the example",
    /** voor schermlezers achter "View the example", met {naam} */
    bekijkVoor: "for {naam}",
    nietErbij: "Is your sector not listed?",
    nietErbijTekst: "Smileyapp can be used in all sectors. Request a demo and we will look together at what suits you.",
    demo: "Request a demo",
    alle: "All sectors",
    waar: "Where do you measure?",
    voorbeeldLabel: "Example, in your own dashboard you can change everything",
    /** met {naam} */
    voorbeeldKop: "Sample questionnaire: {naam}",
    voorbeeldUitleg: "Five questions as a starting point. It is an example by ZekerFlex, not a questionnaire from a Smileyapp customer.",
    samenstellen: "Build your own questionnaire",
    video: "The animated video on the Dutch home page shows how Smileyapp could work in hospitality.",
    /** met {duur} */
    videoLink: "Watch the video ({duur}, in Dutch)",
    ervaring: "What customers in education say",
    benieuwd: "Curious what this looks like for your organisation?",
    andere: "Other sectors",
  },
  branches: BRANCHES_EN,
  klantenPagina: {
    boven: "Customer stories",
    sub: "Two customers tell in their own words what they use Smileyapp for.",
    /** onder een quote die in het Nederlands blijft staan */
    origineel: "Original in Dutch",
    eerst: "How it used to be done",
    meten: "What they measure",
    klantenKop: "Smileyapp customers",
    slot: "Want to know what your customers, guests or students think too?",
    onderwijs: "Smileyapp in education",
    verhalen: VERHALEN_EN,
  },
  contact: {
    boven: "Contact",
    kop: "We love customer feedback",
    sub: "And questions and comments too",
    koos: "You chose",
    gegevens: "Contact details",
    widgetAlt: "The Smileyapp rating widget: an average score with three smileys",
    formulierKop: "Get in touch below!",
    /** het onderwerp van de mail; met {naam} als iemand van een prijskaart komt */
    onderwerp: "Question via the website",
    onderwerpPakket: "Interest in the {naam}",
  },
  gesloten: GESLOTEN_EN,
  partner: {
    boven: "Become a partner?",
    kop: "Together we create even more satisfaction",
    sub: "Get in touch to become a partner. Become a Smileyapp partner now!",
    kort: ["High commission", "Customer satisfaction and hospitality", "Improve your company or event"],
    beeldAlt: "Two fists bumping: working together",
    uitlegKop: "Become a Smileyapp partner now!",
    uitleg: [
      "Partners are incredibly important, and the aim of the Smileyapp Partner Programme is to take each other's product to a higher level.",
      "Together with our partners we create more satisfaction, more hospitable organisations, higher customer satisfaction and more revenue!",
      "Do you have a company or do you organise an event where you can use Smileyapp? Then become a partner and we share the revenue! How does it work?",
      "You sell Smileyapp to your customers, visitors or guests and receive part of the revenue!",
    ],
    voordelen: ["High commission", "Get feedback on your event", "Your customers gain insight into their points for improvement", "Your event gets better every time"],
    formulierKop: "Get in touch to become a partner",
  },
  samenstel: SAMENSTEL_EN,
  reken: REKEN_EN,
  vergelijk: VERGELIJK_EN,
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
    branchesTitel: "Branchen · Smileyapp (Designvorschlag)",
    branchesOmschrijving: "Fünf Beispiele dafür, wo Sie mit Smileyapp messen und was Sie fragen können. Designvorschlag von ZekerFlex; die offizielle Website ist smileyapp.nl.",
    brancheTitel: "{kop} · Smileyapp (Designvorschlag)",
    klantenTitel: "Kundenstimmen · Smileyapp (Designvorschlag)",
    klantenOmschrijving: "Zwei Kunden erzählen in ihren eigenen Worten, wofür sie Smileyapp nutzen. Designvorschlag von ZekerFlex; die offizielle Website ist smileyapp.nl.",
    contactTitel: "Kontakt · Smileyapp (Designvorschlag)",
    contactOmschrijving: "Die Kontaktdaten von Smileyapp. Designvorschlag von ZekerFlex; die offizielle Website ist smileyapp.nl.",
    partnerTitel: "Partner werden · Smileyapp (Designvorschlag)",
    partnerOmschrijving: "Werden Sie Partner von Smileyapp. Designvorschlag von ZekerFlex; die offizielle Website ist smileyapp.nl.",
    samenstellenTitel: "Eigenen Fragebogen zusammenstellen · Smileyapp (Designvorschlag)",
    samenstellenOmschrijving: "Wählen Sie Beispielfragen und sehen Sie, wie Ihr Fragebogen auf einem Smartphone aussieht. Designvorschlag von ZekerFlex; die offizielle Website ist smileyapp.nl.",
    vergelijkenTitel: "Smileyapp oder eine Umfrage auf Papier? · Smileyapp (Designvorschlag)",
    vergelijkenOmschrijving: "Smileyapp und eine Umfrage auf Papier nebeneinander. Designvorschlag von ZekerFlex; die offizielle Website ist smileyapp.nl.",
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
    verhalen: "Die Geschichten lesen",
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
  branchePagina: {
    boven: "Branchen",
    kop: "Smileyapp ist für alle Branchen einsetzbar",
    sub: "Fünf Beispiele dafür, wo Sie messen und was Sie fragen können.",
    bekijk: "Beispiel ansehen",
    bekijkVoor: "für {naam}",
    nietErbij: "Ist Ihre Branche nicht dabei?",
    nietErbijTekst: "Smileyapp ist für alle Branchen einsetzbar. Fragen Sie eine Demo an, dann schauen wir gemeinsam, was passt.",
    demo: "Demo anfragen",
    alle: "Alle Branchen",
    waar: "Wo messen Sie?",
    voorbeeldLabel: "Beispiel, in Ihrem eigenen Dashboard passen Sie alles an",
    voorbeeldKop: "Beispielfragebogen: {naam}",
    voorbeeldUitleg: "Fünf Fragen als Ausgangspunkt. Es ist ein Beispiel von ZekerFlex, kein Fragebogen eines Kunden von Smileyapp.",
    samenstellen: "Eigenen Fragebogen zusammenstellen",
    video: "Der Animationsfilm auf der niederländischen Startseite zeigt, wie Smileyapp in der Gastronomie funktionieren könnte.",
    videoLink: "Video ansehen ({duur}, auf Niederländisch)",
    ervaring: "Was Kunden aus dem Bildungsbereich sagen",
    benieuwd: "Neugierig, wie das für Ihre Organisation aussieht?",
    andere: "Andere Branchen",
  },
  branches: BRANCHES_DE,
  klantenPagina: {
    boven: "Kundenstimmen",
    sub: "Zwei Kunden erzählen in ihren eigenen Worten, wofür sie Smileyapp nutzen.",
    origineel: "Original auf Niederländisch",
    eerst: "Wie es früher lief",
    meten: "Was sie messen",
    klantenKop: "Kunden von Smileyapp",
    slot: "Möchten auch Sie wissen, was Ihre Kunden, Gäste oder Studierenden denken?",
    onderwijs: "Smileyapp im Bildungsbereich",
    verhalen: VERHALEN_DE,
  },
  contact: {
    boven: "Kontakt",
    kop: "Wir lieben Kundenfeedback",
    sub: "Und auch Fragen und Anmerkungen",
    koos: "Ihre Wahl",
    gegevens: "Kontaktdaten",
    widgetAlt: "Das Rating-Widget von Smileyapp: ein Durchschnittswert mit drei Smileys",
    formulierKop: "Nehmen Sie unten Kontakt auf!",
    onderwerp: "Frage über die Website",
    onderwerpPakket: "Interesse am {naam}",
  },
  gesloten: GESLOTEN_DE,
  partner: {
    boven: "Partner werden?",
    kop: "Gemeinsam schaffen wir noch mehr Zufriedenheit",
    sub: "Nehmen Sie Kontakt auf, um Partner zu werden. Werden Sie jetzt Partner von Smileyapp!",
    kort: ["Hohe Provision", "Kundenzufriedenheit und Gastfreundschaft", "Verbessern Sie Ihr Unternehmen oder Ihre Veranstaltung"],
    beeldAlt: "Zwei Fäuste, die sich berühren: Zusammenarbeit",
    uitlegKop: "Werden Sie jetzt Partner von Smileyapp!",
    uitleg: [
      "Partner sind unglaublich wichtig, und das Ziel des Smileyapp-Partnerprogramms ist es, das Produkt des jeweils anderen auf ein höheres Niveau zu heben.",
      "Gemeinsam mit unseren Partnern schaffen wir mehr Zufriedenheit, gastfreundlichere Organisationen, eine höhere Kundenzufriedenheit und mehr Umsatz!",
      "Haben Sie ein Unternehmen oder organisieren Sie eine Veranstaltung, bei der Sie Smileyapp einsetzen können? Dann werden Sie Partner und wir teilen den Erlös! Wie funktioniert es?",
      "Sie verkaufen Smileyapp an Ihre Kunden, Besucher oder Gäste und erhalten einen Teil des Erlöses!",
    ],
    voordelen: ["Hohe Provision", "Erhalten Sie Feedback zu Ihrer Veranstaltung", "Ihre Kunden erhalten Einblick in ihre Verbesserungspunkte", "Ihre Veranstaltung wird jedes Mal besser"],
    formulierKop: "Nehmen Sie Kontakt auf, um Partner zu werden",
  },
  samenstel: SAMENSTEL_DE,
  reken: REKEN_DE,
  vergelijk: VERGELIJK_DE,
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

// ---- deel 6b: hulpjes voor de vertaalde pagina's -------------------------------

/** De tekst van een branche in de taal; een onbekende slug (ook "constructor") bestaat niet. */
export function brancheTaal(slug: string, taal: Vertaling): BrancheTekst | undefined {
  const tabel = TEKSTEN[taal].branches;
  return Object.hasOwn(tabel, slug) ? tabel[slug] : undefined;
}

/**
 * De voorbeeldvragen van de samensteller in de taal: dezelfde id's en soorten als KEUZEVRAGEN
 * (lib/voorstel/smileyapp-samensteller.ts), met de vertaalde tekst en de vertaalde naam van de branche.
 */
export function keuzevragenTaal(taal: Vertaling): KeuzeVraag[] {
  return BRANCHE_LIJST.flatMap((b) => {
    const t = brancheTaal(b.slug, taal);
    return b.vragen.map((v, i) => ({ id: `${b.slug}-${i + 1}`, branche: b.slug, groep: t?.naam ?? b.naam, soort: SOORT_SLEUTEL[v.soort], tekst: t?.vragen[i] ?? v.tekst }));
  });
}

export interface RijTaal extends Rij {
  /** false: een eigen rij van het team, die in de ingevoerde taal (Nederlands) blijft */
  vertaald: boolean;
}

/** De rijen van de vergelijking in de taal: een standaardrij vertaald, een eigen rij van het team zoals hij is ingevoerd. */
export function vergelijkRijenTaal(rijen: readonly Rij[], taal: Vertaling): RijTaal[] {
  const tabel = TEKSTEN[taal].vergelijk.rijen;
  return rijen.map((r) => {
    const v = !r.eigen && Object.hasOwn(tabel, r.id) ? tabel[r.id] : undefined;
    return v ? { ...r, ...v, vertaald: true } : { ...r, vertaald: false };
  });
}
