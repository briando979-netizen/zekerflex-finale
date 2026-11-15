// De rustige, redactionele opmaak van een aanbodpagina (15 nov 2026, eigenaar: "bouw die weergave", naar het voorbeeld van de
// voice-pagina van Bird): een grote kop links met een productkaart rechts, daarna kopblokken met links de vraag en rechts het
// antwoord, drie kolommen zonder kaarten, veelgestelde vragen, een lijst "bouw de rest" en een groot slotblok. Alles wat hier
// staat komt uit wat ZekerFlex Telefonie echt kan (lib/telephony/plans.ts, fase 1: aanvragen, een mens zet het nummer klaar);
// geen prijzen (die past de eigenaar aan in Admin → Telefonie), geen verzonnen cijfers. Puur: geen prisma of kv.

export interface Kolom {
  kop: string;
  tekst: string;
}

export interface Redactioneel {
  hero: { kop: string; tekst: string; knop: { label: string; href: string }; tweede: { label: string; href: string }; noot: string };
  /** de kaart rechts in de kop: een voorbeeld, geen echte gegevens */
  kaart: { titel: string; badge: string; regels: { label: string; waarde: string }[] };
  verschil: { kop: string; tekst: string };
  drie: { kop: string; kolommen: [Kolom, Kolom, Kolom] };
  regels: { kop: string; tekst: string; kolommen: [Kolom, Kolom, Kolom] };
  vragen: { kop: string; items: { vraag: string; antwoord: string }[] };
  rest: { kop: string; items: { slug: string; tekst: string }[] };
  slot: { kop: string; kanalen: string[] };
}

export const REDACTIONEEL: Record<string, Redactioneel> = {
  telefonie: {
    hero: {
      kop: "Een zakelijk nummer waar klanten je mee herkennen en waar altijd iemand opneemt.",
      tekst:
        "Kies een nieuw mobiel nummer, of houd je eigen nummer en schakel het door naar ZekerFlex. Laat gesprekken naar je eigen telefoon gaan, laat een assistent opnemen als jij bezig bent en lees terug wat er gezegd is. Je stelt het samen in je eigen ZekerFlex-omgeving en ziet de prijs voordat je aanvraagt.",
      knop: { label: "Aan de slag", href: "/register?type=bedrijf" },
      tweede: { label: "Neem contact op", href: "/contact" },
      noot: "Aanvragen kan al. Een mens zet je nummer voor je klaar en neemt contact met je op.",
    },
    kaart: {
      titel: "Jouw zaak",
      badge: "Voorbeeld",
      regels: [
        { label: "Klantgesprekken", waarde: "Een nummer voor je zaak" },
        { label: "Doorschakelen", waarde: "Naar je eigen telefoon, binnen je openingstijden" },
        { label: "Neem je niet op?", waarde: "De assistent, of voicemail in je ZekerFlex-chat" },
      ],
    },
    verschil: {
      kop: "Wat is het verschil tussen een nieuw nummer en je eigen nummer houden?",
      tekst:
        "Een nieuw Nederlands mobiel nummer (097) is meestal dezelfde of de volgende werkdag klaar. Houd je liever je eigen nummer, dan zet je bij je provider doorschakelen aan naar je ZekerFlex-lijn; alle opties werken dan op je eigen nummer. Nummers als 06, 085, 088, een lokaal netnummer of 0800 lopen via een partner: je hoort binnen twee werkdagen wat het kost en wanneer het klaar is. Je nummer helemaal laten verhuizen duurt een paar weken; tot die tijd kun je doorschakelen.",
    },
    drie: {
      kop: "Neem zelf op, schakel door of laat de assistent het doen.",
      kolommen: [
        { kop: "Doorschakelen en teamnummer", tekst: "Gesprekken gaan naar je eigen telefoon, binnen je openingstijden. Met een teamnummer gaan meerdere telefoons tegelijk over; wie het eerst opneemt, heeft het gesprek." },
        { kop: "AI-assistent", tekst: "Neemt dag en nacht op in het Nederlands of Engels, beantwoordt vragen over je bedrijf en plant terugbelafspraken. Van elk gesprek krijg je een samenvatting." },
        { kop: "Voicemail en keuzemenu", tekst: "Ingesproken berichten komen als tekst en geluid in je ZekerFlex-chat. Met een keuzemenu komt elke keuze bij de juiste persoon." },
      ],
    },
    regels: {
      kop: "Houd overzicht en blijf binnen de regels.",
      tekst:
        "Een nummer kopen is zelden het lastige deel; het gaat erom dat het goed is ingericht. Je kiest een bundel (Start, Zakelijk of AI Compleet) of losse opties en ziet de prijs live. Daarna zetten wij het nummer voor je klaar.",
      kolommen: [
        { kop: "Opnemen met melding", tekst: "Gesprekken opnemen kan, met een melding aan de beller. Je luistert ze terug en leest ze als tekst." },
        { kop: "Sms vanuit ZekerFlex", tekst: "Sms'jes ontvangen en versturen vanuit je eigen omgeving, naast je gesprekken en je chat." },
        { kop: "Laat zien waar je bereikbaar bent", tekst: "Zet je nummer op je profiel, bij je diensten en vacatures, als belknop op je website en op je facturen." },
      ],
    },
    vragen: {
      kop: "Vragen voordat je begint",
      items: [
        { vraag: "Welk nummer kan ik nu direct krijgen?", antwoord: "Een nieuw Nederlands mobiel 097-nummer (bellen en sms), of je eigen nummer met doorschakelen. Andere soorten, zoals 06, 085, 088, lokaal en 0800, lopen via een partner en zijn op aanvraag." },
        { vraag: "Verhuist mijn nummer naar ZekerFlex als ik doorschakel?", antwoord: "Nee. Bij doorschakelen blijft je nummer bij je provider; de gesprekken komen binnen op je ZekerFlex-lijn. Wil je het nummer echt overzetten, kies dan Bestaand nummer overzetten; dat duurt een paar weken." },
        { vraag: "Kan ik ook in de ZekerFlex-app of op de computer opnemen?", antwoord: "Nog niet. Dat vraagt een eigen koppeling en staat op onze lijst. Nu neem je op je eigen telefoon op, of de assistent doet het." },
      ],
    },
    rest: {
      kop: "Bouw de rest van je bedrijf online.",
      items: [
        { slug: "website", tekst: "Een snelle website op je eigen domein, zonder cookies of trackers van anderen." },
        { slug: "zakelijke-mail", tekst: "Een zakelijk e-mailadres op je eigen domein." },
        { slug: "google-reviews", tekst: "Vraag je klanten om een Google-review en volg ze op één plek." },
        { slug: "facturen-en-betalen", tekst: "Facturen en betaalverzoeken in dezelfde omgeving." },
      ],
    },
    slot: { kop: "Begin met een nummer. Bouw verder met ZekerFlex.", kanalen: ["Bellen", "Sms", "Voicemail", "Chat"] },
  },
};

export const redactioneelVan = (slug: string): Redactioneel | undefined => (Object.hasOwn(REDACTIONEEL, slug) ? REDACTIONEEL[slug] : undefined);
