import type { Locale } from "@/lib/i18n/config";
import { SUPPORT_CHAT_WERKGEVER, type HulpTeksten } from "@/lib/hulp/hulpjes";
import { RONDLEIDING_BEDRIJF_TEKSTEN } from "@/lib/onboarding/rondleiding-bedrijf";

// ---------------------------------------------------------------------------
// Het hulpcentrum voor bedrijven: het vraagteken in de kopbalk van de werkgeversapp (components/app/EmployerShell.tsx), met
// dezelfde indeling als dat voor werkers (Home, Hulp, Nieuws; components/app/HulpCentrum.tsx met soort="bedrijf") maar met eigen vragen en eigen
// nieuws (15 nov 2026: "twee aparte versies, een voor de werknemers en een voor bedrijven"). De werker-versie staat in lib/hulp/teksten.ts.
// De werkgeversapp kent Nederlands en Engels (EMPLOYER_LOCALES); de server kiest er één, alleen die gaat mee naar de browser.
// Menunamen in de antwoorden zijn precies die van de app (lib/i18n/dictionaries.ts: nav), anders zoekt een bedrijf naar een knop die
// niet bestaat. Nieuws: alleen wat echt live staat, nieuwste eerst, met een vaste datum; een nieuw bericht krijgt een nieuw id.
// Machine-assisted translation (EN): native-speaker review recommended.
// ---------------------------------------------------------------------------

const nl: HulpTeksten = {
  knop: "Hulp",
  titel: "Hulpcentrum",
  onder: "Alles om goed te werken met ZekerFlex",
  zoek: "Waar ben je naar op zoek?",
  sluit: "Sluiten",
  terug: "Terug",
  tabs: { home: "Home", hulp: "Hulp", nieuws: "Nieuws" },
  home: {
    vragen: ["Veelgestelde vragen", "Snel antwoord op wat bedrijven het vaakst vragen"],
    handleidingen: ["Handleidingen", "Stap voor stap uitgelegd in onze kennisbank"],
    chat: ["Chat met ons", "Direct contact met ons team"],
    mail: ["Mail ons", "Lukt iets niet? We helpen je."],
    feedback: ["Geef ons feedback", "Wat kan beter? We lezen alles."],
    status: {
      titel: "Status",
      ok: "Alles werkt zoals het hoort",
      traag: "Een deel werkt trager dan normaal",
      storing: "Er is een storing; we werken eraan",
      onbekend: "Bekijk of alles werkt",
    },
  },
  hulp: {
    titel: "Veelgestelde vragen",
    leeg: "Geen antwoord gevonden op “{q}”.",
    vraagHet: "Stel je vraag in de chat",
    alles: "Alle veelgestelde vragen op de website",
  },
  feedback: {
    titel: "Geef ons feedback",
    uitleg: "Wat vind je van ZekerFlex voor bedrijven? Wat mist er, of wat werkt niet handig? Je bericht komt bij ons team terecht.",
    veld: "Je feedback",
    plaatshouder: "Bijv. ik zou graag een overzicht willen van…",
    stuur: "Versturen",
    bezig: "Versturen…",
    klaar: "Bedankt! Ons team leest je bericht.",
    fout: "Versturen lukte niet. Probeer het zo nog eens.",
    teKort: "Schrijf iets meer, dan begrijpen we je beter.",
  },
  nieuws: { titel: "Nieuw in de app", nieuw: "Nieuw" },
  rondleiding: RONDLEIDING_BEDRIJF_TEKSTEN.nl.opnieuw,
  vragen: [
    {
      id: "klus-uitzetten",
      v: "Hoe zet ik een klus uit?",
      a: "Kies op Jouw start de knop Klus uitzetten. Vul in wat er moet gebeuren, wanneer en waar, en welk tarief je biedt. Daarna zien werkers die bij de klus passen hem en kunnen ze reageren.",
      link: { href: "/werkgever/diensten/nieuw", label: "Klus uitzetten" },
    },
    {
      id: "bedrijf-verifieren",
      v: "Waarom moet ik mijn bedrijf laten verifiëren?",
      a: "Zo weten werkers dat je een echt bedrijf bent. Vul op Jouw start je KVK-nummer in bij de stap Bedrijf verifiëren; meestal is het binnen een werkdag klaar. Tot die tijd kun je één testklus uitzetten. Iemand echt inplannen kan pas als je bedrijf is geverifieerd.",
      link: { href: "/werkgever", label: "Naar Jouw start" },
    },
    {
      id: "wie-inplannen",
      v: "Hoe kies ik wie ik inplan?",
      a: "Open de klus onder Klussen. Daar zie je wie heeft gereageerd. Kies de werker die je wilt inplannen. Je kunt de werker eerst een bericht sturen in de Chat.",
      link: { href: "/werkgever/diensten", label: "Naar Klussen" },
    },
    {
      id: "favorieten",
      v: "Kan ik werkers waar ik tevreden over ben terugvragen?",
      a: "Bewaar ze onder Favorieten. Werkers die jou volgen krijgen bovendien meteen een melding zodra je een nieuwe klus uitzet.",
      link: { href: "/werkgever/favorieten", label: "Naar Favorieten" },
    },
    {
      id: "uren",
      v: "Hoe keur ik uren goed?",
      a: "Na afloop van een klus dient de werker zijn uren in. Onder Uren goedkeuren zie je wat er wacht. Alleen goedgekeurde uren worden gefactureerd. Wil je niet elke keer zelf klikken? Zet daar automatisch goedkeuren aan.",
      link: { href: "/werkgever/uren", label: "Naar Uren goedkeuren" },
    },
    {
      id: "facturen",
      v: "Waar vind ik mijn facturen en hoe betaal ik ze?",
      a: "Onder Facturen staan al je facturen. Op de factuur en de betaalpagina staat hoe je betaalt, ook per bankoverschrijving. Maak je geld over, dan zet ZekerFlex de factuur op betaald zodra het bedrag is bijgeschreven.",
      link: { href: "/werkgever/facturen", label: "Naar Facturen" },
    },
    {
      id: "chat",
      v: "Hoe neem ik contact op met een werker?",
      a: "Via Chat. Naast tekst stuur je foto's en documenten, deel je een locatie (ook live), plan je een bericht in voor later en maak je een afspraak waarop mensen kunnen aanmelden.",
      link: { href: "/werkgever/berichten", label: "Naar Chat" },
    },
    {
      id: "collega",
      v: "Kan een collega ook inloggen?",
      a: "Ja. Nodig je collega's uit op de pagina Team. Zij loggen in met hun eigen account.",
      link: { href: "/werkgever/team", label: "Naar Team" },
    },
    {
      id: "geblokkeerd",
      v: "Hoe blokkeer ik een werker?",
      a: "Onder Geblokkeerd beheer je werkers die je niet meer wilt zien op je klussen. Een geblokkeerde werker kan ook geen nieuw gesprek met je beginnen.",
      link: { href: "/werkgever/geblokkeerd", label: "Naar Geblokkeerd" },
    },
    {
      id: "overeenkomsten",
      v: "Waar vind ik modelovereenkomsten?",
      a: "Onder Modelovereenkomsten staan de overeenkomsten die je kunt gebruiken, en onder Compliance zie je wat je moet regelen voor werkers in jouw situatie.",
      link: { href: "/werkgever/overeenkomsten", label: "Naar Modelovereenkomsten" },
    },
    {
      id: "meldingen",
      v: "Hoe krijg ik meldingen?",
      a: "Het belletje bovenin laat zien wat er nieuw is, bijvoorbeeld een reactie op een klus of uren die wachten. Zet meldingen op je telefoon aan in Instellingen, dan krijg je ze ook als ZekerFlex dicht is.",
      link: { href: "/werkgever/instellingen", label: "Naar Instellingen" },
    },
    {
      id: "probleem",
      v: "Er gaat iets mis met een werker of een klus. Wie helpt me?",
      a: "Stuur ons een bericht via Chat met ons; we helpen je zo snel mogelijk. Gaat het over de klus zelf, zoals tijden of het adres? Stuur dan de werker een bericht in de Chat.",
      link: { href: SUPPORT_CHAT_WERKGEVER, label: "Chat met ons" },
    },
  ],
  nieuwsItems: [
    {
      id: "2026-11-15-chat",
      dag: "2026-11-15",
      datum: "15 november 2026",
      titel: "Meer mogelijkheden in de chat",
      tekst: "Stuur stickers, deel je locatie live (15 minuten, 1 uur of 8 uur), plan een bericht in voor later, zet een status van 24 uur, deel een contact als kaartje en maak een afspraak waarop mensen kunnen aanmelden. Je ziet het allemaal in Chat.",
      link: { href: "/werkgever/berichten", label: "Naar Chat" },
    },
    {
      id: "2026-11-14-overschrijving",
      dag: "2026-11-14",
      datum: "14 november 2026",
      titel: "Betalen per bankoverschrijving",
      tekst: "Op de factuur en op de betaalpagina staat nu ook hoe je per bankoverschrijving betaalt. Is het bedrag bijgeschreven, dan zet ZekerFlex de factuur op betaald.",
      link: { href: "/werkgever/facturen", label: "Naar Facturen" },
    },
    {
      id: "2026-11-14-klusconcept",
      dag: "2026-11-14",
      datum: "14 november 2026",
      titel: "Je klus blijft bewaard bij het aanmelden",
      tekst: "Begin je een klus voordat je een account hebt, dan staat hij na het aanmelden voor je klaar. Je hoeft hem niet opnieuw in te vullen.",
    },
    {
      id: "2026-11-10-bedrijfsnaam",
      dag: "2026-11-10",
      datum: "10 november 2026",
      titel: "Je bedrijfsnaam staat bij elke klus",
      tekst: "Werkers zien bij elke klus en in hun meldingen voor welk bedrijf ze werken, ook als de klus op een los adres is.",
    },
  ],
};

const en: HulpTeksten = {
  knop: "Help",
  titel: "Help centre",
  onder: "Everything you need to work well with ZekerFlex",
  zoek: "What are you looking for?",
  sluit: "Close",
  terug: "Back",
  tabs: { home: "Home", hulp: "Help", nieuws: "News" },
  home: {
    vragen: ["Frequently asked questions", "Quick answers to what companies ask most"],
    handleidingen: ["Guides", "Explained step by step in our knowledge base"],
    chat: ["Chat with us", "Direct contact with our team"],
    mail: ["Email us", "Something not working? We will help."],
    feedback: ["Give us feedback", "What could be better? We read everything."],
    status: {
      titel: "Status",
      ok: "Everything works as it should",
      traag: "Part of the platform is slower than normal",
      storing: "There is an outage; we are working on it",
      onbekend: "Check whether everything works",
    },
  },
  hulp: {
    titel: "Frequently asked questions",
    leeg: "No answer found for “{q}”.",
    vraagHet: "Ask your question in the chat",
    alles: "All frequently asked questions on the website",
  },
  feedback: {
    titel: "Give us feedback",
    uitleg: "What do you think of ZekerFlex for companies? What is missing, or what is not convenient? Your message goes to our team.",
    veld: "Your feedback",
    plaatshouder: "E.g. I would like an overview of…",
    stuur: "Send",
    bezig: "Sending…",
    klaar: "Thank you! Our team reads your message.",
    fout: "Sending failed. Please try again in a moment.",
    teKort: "Write a little more so we understand you better.",
  },
  nieuws: { titel: "New in the app", nieuw: "New" },
  rondleiding: RONDLEIDING_BEDRIJF_TEKSTEN.en.opnieuw,
  vragen: [
    {
      id: "klus-uitzetten",
      v: "How do I post a job?",
      a: "On Your start, choose Post a job. Fill in what needs to be done, when and where, and the rate you offer. Workers who fit the job will see it and can respond.",
      link: { href: "/werkgever/diensten/nieuw", label: "Post a job" },
    },
    {
      id: "bedrijf-verifieren",
      v: "Why do I have to verify my company?",
      a: "It shows workers you are a real company. On Your start, enter your KVK number in the step to verify your company; it is usually done within one working day. Until then you can post one test job. Actually scheduling someone is only possible once your company is verified.",
      link: { href: "/werkgever", label: "Go to Your start" },
    },
    {
      id: "wie-inplannen",
      v: "How do I choose who to schedule?",
      a: "Open the job under Jobs. There you see who has responded. Choose the worker you want to schedule. You can message the worker first in Chat.",
      link: { href: "/werkgever/diensten", label: "Go to Jobs" },
    },
    {
      id: "favorieten",
      v: "Can I ask workers I am happy with again?",
      a: "Save them under Favourites. Workers who follow you also get a notification as soon as you post a new job.",
      link: { href: "/werkgever/favorieten", label: "Go to Favourites" },
    },
    {
      id: "uren",
      v: "How do I approve hours?",
      a: "After a job the worker submits their hours. Under Approve hours you see what is waiting. Only approved hours are invoiced. Do not want to click every time? Switch on automatic approval there.",
      link: { href: "/werkgever/uren", label: "Go to Approve hours" },
    },
    {
      id: "facturen",
      v: "Where do I find my invoices and how do I pay them?",
      a: "Under Invoices you find all your invoices. The invoice and the payment page show how to pay, including by bank transfer. If you transfer the money, ZekerFlex marks the invoice as paid once the amount has been credited.",
      link: { href: "/werkgever/facturen", label: "Go to Invoices" },
    },
    {
      id: "chat",
      v: "How do I contact a worker?",
      a: "Through Chat. Besides text you can send photos and documents, share a location (also live), schedule a message for later and create an event people can sign up for.",
      link: { href: "/werkgever/berichten", label: "Go to Chat" },
    },
    {
      id: "collega",
      v: "Can a colleague log in too?",
      a: "Yes. Invite your colleagues on the Team page. They log in with their own account.",
      link: { href: "/werkgever/team", label: "Go to Team" },
    },
    {
      id: "geblokkeerd",
      v: "How do I block a worker?",
      a: "Under Blocked you manage workers you no longer want to see on your jobs. A blocked worker cannot start a new conversation with you either.",
      link: { href: "/werkgever/geblokkeerd", label: "Go to Blocked" },
    },
    {
      id: "overeenkomsten",
      v: "Where do I find model agreements?",
      a: "Under Model agreements you find the agreements you can use, and under Compliance you see what you need to arrange for workers in your situation.",
      link: { href: "/werkgever/overeenkomsten", label: "Go to Model agreements" },
    },
    {
      id: "meldingen",
      v: "How do I get notifications?",
      a: "The bell at the top shows what is new, for example a response to a job or hours waiting. Switch on notifications on your phone in Settings, and you get them even when ZekerFlex is closed.",
      link: { href: "/werkgever/instellingen", label: "Go to Settings" },
    },
    {
      id: "probleem",
      v: "Something goes wrong with a worker or a job. Who helps me?",
      a: "Send us a message via Chat with us; we will help as soon as we can. Is it about the job itself, such as times or the address? Then message the worker in Chat.",
      link: { href: SUPPORT_CHAT_WERKGEVER, label: "Chat with us" },
    },
  ],
  nieuwsItems: [
    {
      id: "2026-11-15-chat",
      dag: "2026-11-15",
      datum: "15 November 2026",
      titel: "More in the chat",
      tekst: "Send stickers, share your location live (15 minutes, 1 hour or 8 hours), schedule a message for later, post a 24-hour status, share a contact as a card and create an event people can sign up for. You find it all in Chat.",
      link: { href: "/werkgever/berichten", label: "Go to Chat" },
    },
    {
      id: "2026-11-14-overschrijving",
      dag: "2026-11-14",
      datum: "14 November 2026",
      titel: "Paying by bank transfer",
      tekst: "The invoice and the payment page now also show how to pay by bank transfer. Once the amount is credited, ZekerFlex marks the invoice as paid.",
      link: { href: "/werkgever/facturen", label: "Go to Invoices" },
    },
    {
      id: "2026-11-14-klusconcept",
      dag: "2026-11-14",
      datum: "14 November 2026",
      titel: "Your job is kept when you sign up",
      tekst: "If you start a job before you have an account, it is waiting for you after signing up. You do not have to fill it in again.",
    },
    {
      id: "2026-11-10-bedrijfsnaam",
      dag: "2026-11-10",
      datum: "10 November 2026",
      titel: "Your company name is on every job",
      tekst: "Workers see which company they work for on every job and in their notifications, even if the job is at a separate address.",
    },
  ],
};

/** De hulpteksten voor bedrijven in de taal van de werkgeversapp (nl of en); elke andere taal valt terug op Nederlands. */
export function hulpTekstenWerkgever(locale: Locale): HulpTeksten {
  return locale === "en" ? en : nl;
}

export const HULP_TEKSTEN_WERKGEVER = { nl, en } as const;
