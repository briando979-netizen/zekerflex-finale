// ---------------------------------------------------------------------------
// Ontwerpvoorstel voor SmileyApp (smileyapp.zekerflex.com, of
// /voorstel/smileyapp op zekerflex.com): alle teksten, prijzen, beelden en
// contactgegevens van smileyapp.nl (opgehaald op 18 nov 2026) op één plek.
// De pagina's, de veelgestelde vragen en de chatassistent lezen alleen hieruit,
// zodat een prijs nooit op twee plekken verschillend staat. Niets verzonnen:
// wat hier niet staat, staat ook niet op hun site. Puur bestand (geen prisma,
// kv of zod), dus ook client-componenten mogen het importeren.
// ---------------------------------------------------------------------------

export const BASE = "/voorstel/smileyapp";
/** De beelden staan in public/voorstel/smileyapp (herkomst in CREDITS.md daar). */
export const beeld = (bestand: string) => `${BASE}/${bestand}`;

export const OFFICIELE_SITE = "https://smileyapp.nl/";
export const KLANTLOGIN = "https://smileyapp.online/login";
export const PRIVACY = "https://smileyapp.nl/privacyverklaring/";
export const VOORWAARDEN = "https://smileyapp.nl/disclaimer-en-algemene-voorwaarden/";

/** De band op elke pagina, zolang Martijn het voorstel niet heeft goedgekeurd. */
export const VOORSTEL_BAND = "Ontwerpvoorstel van ZekerFlex voor SmileyApp. De officiële website staat op smileyapp.nl.";

export const CONTACT = {
  naam: "Smileyapp",
  email: "info@smileyapp.nl",
  kvk: "02094735",
  postadres: "Sloep 37, 9732 CB Groningen",
  kantooradres: "Hereplein 4, 9711 GA Groningen",
  onderdeelVan: "Reconcep / 100% ondernemen",
  onderdeelVanUrl: "https://100procentondernemen.nl",
} as const;

export const SLOGAN = "Voor echte reviews";

export const HERO = {
  kop: "Klanttevredenheid meten met de leukste, simpelste en snelste tool van Nederland",
  vraag:
    "Wil jij meer omzet genereren doordat je meer én beter inzicht hebt in de tevredenheid van je klanten, gasten, bezoekers, medewerkers en studenten?",
  intro: [
    "Smileyapp meet op een eenvoudige, snelle en leuke manier de klanttevredenheid, gastvrijheid, medewerkerstevredenheid en product/diensttevredenheid bij jouw organisatie!",
    "Geen saaie enquêtes, maar een eenvoudige, snelle en leuke tool die realtime inzicht geeft in de wensen en behoeftes van jouw doelgroep.",
    "Smileyapp is enorm gebruiksvriendelijk en de resultaten zijn weergegeven in een overzichtelijk dashboard!",
  ],
  /** de vraag op het scherm van hun app (Smileyapp-tevredenheid-meter.png) */
  appVraag: "Weet jij hoe tevreden jouw gasten of klanten zijn?",
} as const;

export const MENU = [
  { label: "Zo werkt het", href: `${BASE}#zo-werkt-het` },
  { label: "Pakketten", href: `${BASE}#pakketten` },
  { label: "Klanten", href: `${BASE}#klanten` },
  { label: "Blog", href: `${BASE}/blog` },
  { label: "Partner worden", href: `${BASE}/partner-worden` },
  { label: "Contact", href: `${BASE}/contact` },
] as const;

// ---- pakketten (de enige plek met prijzen) ---------------------------------

export type PakketId = "basis" | "iso" | "mkb" | "maatwerk";

export interface Pakket {
  id: PakketId;
  naam: string;
  /** euro per maand zoals op smileyapp.nl; null = op aanvraag */
  prijs: number | null;
  minimaalMaanden: number | null;
  /** het lint op hun prijstabel */
  label: string;
  /** de opvallende kaart in het midden */
  uitgelicht: boolean;
  onderdelen: readonly string[];
  uitleg?: readonly string[];
}

export const PAKKETTEN: readonly Pakket[] = [
  {
    id: "basis",
    naam: "Basis Pakket",
    prijs: 49.95,
    minimaalMaanden: 12,
    label: "Populair",
    uitgelicht: false,
    onderdelen: ["1 vragenlijst", "10 vragen", "100 beoordelingen", "Eigen huisstijl", "Gepersonaliseerde QR-code", "1 gebruiker", "Instelservice"],
  },
  {
    id: "iso",
    naam: "ISO Pakket",
    prijs: 249.95,
    minimaalMaanden: 6,
    label: "Meest gebruikt",
    uitgelicht: true,
    onderdelen: ["10 vragenlijsten", "100 vragen", "1.000 beoordelingen", "Eigen huisstijl", "Meerdere gebruikers", "Gepersonaliseerde QR-code", "Instelservice"],
  },
  {
    id: "mkb",
    naam: "MKB Pakket",
    prijs: 1499.95,
    minimaalMaanden: 6,
    label: "VIP",
    uitgelicht: false,
    onderdelen: [
      "2 referentie-interviews per week met quotes",
      "Vragenlijsten en beoordelingen",
      "Maandelijkse call om de referenties te bespreken",
      "Bedrijfskleuren op de vragenlijst",
      "Gepersonaliseerd logo",
      "Instelservice",
    ],
  },
  {
    id: "maatwerk",
    naam: "Maatwerk Pakket",
    prijs: null,
    minimaalMaanden: null,
    label: "Populair",
    uitgelicht: false,
    onderdelen: [],
    uitleg: [
      'Heb je andere wensen? Wil je dat wij de vragenlijsten ontwikkelen en bijhouden? Elk bedrijf of organisatie is anders en heeft waarschijnlijk ook andere wensen om de "verschillende soorten" tevredenheid te meten.',
      "Hiervoor hebben we het maatwerk pakket! Dit pakket kun je zelf samenstellen zodat jij exact krijgt wat je nodig hebt.",
      "Misschien heb je meerdere vestigingen, wil je meerdere aspecten binnen je organisatie meten of heb je een (meerdaags)evenement?",
      "Neem contact op en we helpen je graag!",
    ],
  },
];

export const PAKKETTEN_KOP = "Kies een pakket dat bij je past!";

/** "€ 1.499,95": vaste opmaak, op de server en in de browser gelijk. */
export function euro(n: number): string {
  const [hele = "0", cent = "00"] = n.toFixed(2).split(".");
  return `€ ${hele.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cent}`;
}

export const prijsTekst = (p: Pick<Pakket, "prijs">) => (p.prijs === null ? "Op aanvraag" : euro(p.prijs));
export const looptijdTekst = (p: Pick<Pakket, "minimaalMaanden">) => (p.minimaalMaanden === null ? "" : `Minimaal ${p.minimaalMaanden} maanden`);
/** Eén regel per pakket, voor de veelgestelde vragen en de chat. */
export const pakketRegel = (p: Pakket) =>
  p.prijs === null ? `${p.naam}: prijs op aanvraag` : `${p.naam}: ${euro(p.prijs)} maandelijks, ${looptijdTekst(p).toLowerCase()}`;

export function pakket(id: string | undefined | null): Pakket | undefined {
  return PAKKETTEN.find((p) => p.id === id);
}

// ---- de rest van de voorpagina ---------------------------------------------

export const QUOTES = [
  {
    tekst: [
      "Normaliter werd er aan elke student gevraagd om een evaluatieformulier in te vullen via Word. Afgelopen jaar hebben we dit anders aangepakt door gebruik te maken van Smileyapp.",
      "Door de studenten de vrijheid te geven in het beoordelen, hebben we veel waardevolle feedback verzameld. We weten meer over hoe de studenten de minor, en verschillende vakken, hebben ervaren.",
    ],
    naam: "A. Weekamp",
    organisatie: "Hanzehogeschool",
    beeld: beeld("quote-hanze.webp"),
  },
  {
    tekst: [
      "Smileyapp gebruiken wij onder andere bij de stagemarkten en externe activiteiten die wij organiseren met het bedrijfsleven zoals trainingen, workshops, praktijkopdrachten, bedrijfsbezoeken en voorlichting.",
      "Zo krijgen wij direct inzicht in wat goed gaat, welke verbeterpunten er zijn én hoe we dat kunnen realiseren! Van grote toegevoegde waarde voor als je kritisch naar jezelf durft te kijken en het onderwijs wil verbeteren en innoveren.",
    ],
    naam: "M. Magermans",
    organisatie: "Alfa College",
    beeld: beeld("quote-alfa-college.webp"),
  },
] as const;

/** Het blok "Case" op hun voorpagina: logo's met een link naar de klant. */
export const KLANTEN = [
  { naam: "Hanzehogeschool", url: "https://www.hanze.nl/nl", beeld: beeld("klant-hanze.webp"), breed: 480, hoog: 112 },
  { naam: "Basicclean", url: "https://www.basicclean.nl/", beeld: beeld("klant-basicclean.webp"), breed: 173, hoog: 95 },
  { naam: "Alfa College", url: "https://www.alfa-college.nl/", beeld: beeld("klant-alfa-college.webp"), breed: 240, hoog: 240 },
  { naam: "DANW", url: "https://www.danw.nl/home", beeld: beeld("klant-danw.webp"), breed: 480, hoog: 167 },
] as const;

/** Meten · Weten · Verbeteren, met hun illustraties en de zinnen uit "Join the smile!". */
export const STAPPEN = [
  {
    titel: "Meten",
    tekst: "Mensen scannen de QR-code van jouw vragenlijst en geven de mate van hun tevredenheid aan door de smiley te swipen.",
    beeld: beeld("meten.webp"),
    alt: "Smiley met een meetlat",
  },
  {
    titel: "Weten",
    tekst: "De resultaten worden overzichtelijk weergegeven in een dashboard.",
    beeld: beeld("weten.webp"),
    alt: "Smiley met een puzzelstuk en lampjes",
  },
  {
    titel: "Verbeteren",
    tekst: "Zo kun je meteen beginnen om organisatie, product of dienstverlening te verbeteren!",
    beeld: beeld("verbeteren.webp"),
    alt: "Smiley die met een groep een plan afvinkt",
  },
] as const;

export const VRAAGSOORTEN = ["1-10 rating vragen", "open vragen", "ja/nee vragen", "een leeg tekstveld om feedback en gegevens te vragen"] as const;

export const FUNCTIES = {
  kop: "Alles eenvoudig in te stellen",
  punten: [
    "Vragenlijsten eenvoudig zelf aanmaken",
    "Overzichtelijk dashboard",
    "In eigen huisstijl",
    "Eenvoudig de NPS-scores en gemiddelde scores exporteren in een rapport",
    "Klantreacties en feedback eenvoudig verzamelen",
    "Inzetbaar voor alle branches",
    "Meet op een eenvoudige, snelle en leuke manier de tevredenheid",
  ],
  widget: "De rating widget kun je op elke willekeurige site plaatsen en zo jouw klanten of gasten laten zien hoe tevreden anderen zijn.",
} as const;

export const KERNWOORDEN = {
  kop: "Onze kernwoorden zijn eenvoudig, snel & leuk",
  items: [
    { titel: "Eenvoudig", tekst: "Je maakt in no-time je eerste vragenlijst in jouw persoonlijke dashboard. Iedereen kan het!" },
    {
      titel: "Snel",
      tekst:
        "Door de smiley te swipen geven mensen binnen enkele seconden hun tevredenheid door. Én omdat het weinig tijd kost, vinden ze het niet vervelend om bij een volgend bezoek nog een keer feedback te geven.",
    },
    {
      titel: "Leuk",
      tekst:
        "Mensen ervaren de smiley van Smileyapp als leuk. Hierdoor is het responspercentage hoog. Jouw doelgroep wil graag feedback geven, helemaal wanneer ze zien dat er iets mee gedaan wordt!",
    },
  ],
} as const;

export const JOIN = {
  kop: "Join the smile!",
  tekst: [
    "Wil jij de tevredenheid van jouw klanten, gasten, medewerkers, bezoekers of studenten meten? Sluit je dan aan bij de leukste en meest betaalbare smile van Nederland!",
    "Mensen scannen de QR-code van jouw vragenlijst en geven de mate van hun tevredenheid aan door de smiley te swipen.",
    "Er zijn vele mogelijkheden om jouw vragenlijst op te maken. Je kunt bijvoorbeeld kiezen uit 1-10 rating vragen, open vragen, ja/nee vragen of een leeg tekstveld toevoegen om feedback en gegevens te vragen.",
    "De resultaten worden overzichtelijk weergegeven in een dashboard. Zo kun je meteen beginnen om organisatie, product of dienstverlening te verbeteren! De rating widget kun je op elke willekeurige site plaatsen en zo jouw klanten of gasten laten zien hoe tevreden anderen zijn.",
    "Smileyapp is gebruiksvriendelijk voor jong én oud. Het meten van de klanttevredenheid, gastvrijheid of producttevredenheid was nog nooit zo eenvoudig.",
  ],
  knop: "Ik wil meer weten",
} as const;

/** Hun animatiefilmpje op Vimeo (ingebed op smileyapp.nl). Pas na een klik geladen, zonder tracking (dnt=1). */
export const VIDEO = {
  vimeoId: "694612637",
  titel: "Smiley app - Voor echte reviews",
  duur: "0:44",
  poster: beeld("video-poster.webp"),
  pagina: "https://vimeo.com/694612637",
  kop: "Voorbeeld in de horeca",
  bovenkop: "Smileyapp is inzetbaar voor alle branches",
  tekst:
    "Wij zijn er voor alle branches! Dit animatiefilmpje geeft aan hoe Smileyapp zou kunnen werken voor de horeca. Echter kun je Smileyapp toepassen en gebruiken voor alle branches! Wil jij ook een eenvoudige, snelle en leuke manier de klanttevredenheid, gastvrijheid, medewerkerstevredenheid en product/diensttevredenheid meten? Neem dan snel contact op voor jouw oplossing!",
} as const;

// ---- contact en partners -----------------------------------------------------

export const CONTACT_PAGINA = {
  kop: "Wij houden van klantfeedback",
  sub: "Én ook van vragen en opmerkingen",
  formulierKop: "Neem hieronder contact op!",
} as const;

export const PARTNER = {
  kop: "Samen creëren we nog meer tevredenheid",
  sub: "Neem contact op om partner te worden. Word nu partner van Smileyapp!",
  kort: [
    { titel: "Hoge commissievergoeding", beeld: beeld("partner-1.webp") },
    { titel: "Klanttevredenheid en gastvrijheid", beeld: beeld("partner-2.webp") },
    { titel: "Verbeter je bedrijf of event", beeld: beeld("partner-3.webp") },
  ],
  uitlegKop: "Word nu partner van Smileyapp!",
  uitleg: [
    "Partners zijn ontzettend belangrijk en het doel van het Smileyapp Partnerprogramma is om elkaars product naar een hoger niveau te tillen.",
    "Samen met onze partners creëren wij meer tevredenheid, gastvrijere organisaties, een hogere klanttevredenheid en meer omzet!",
    "Heb jij een bedrijf of organiseer je een event waarbij je Smileyapp kunt inzetten? Word dan partner en we delen de opbrengst! Hoe werkt het?",
    "Jij verkoopt Smileyapp aan je klanten, bezoekers of gasten en ontvangt een deel van de opbrengst!",
  ],
  voordelen: ["Hoge commissievergoeding", "Krijg feedback over jouw evenement", "Jouw klanten krijgen inzicht in hun verbeterpunten", "Je event wordt elke keer beter"],
  beeld: beeld("partner-boks.webp"),
} as const;

/** Waar het (dichte) formulier naar vraagt: de pakketten van nu, plus het partnerprogramma. */
export const INTERESSES = [...PAKKETTEN.map((p) => p.naam), "Partnerprogramma", "Anders"] as const;

// ---- blog ------------------------------------------------------------------

export type BlogBlok = { type: "kop"; tekst: string } | { type: "alinea"; tekst: string } | { type: "lijst"; items: readonly string[] };

export interface BlogBericht {
  slug: string;
  titel: string;
  /** zoals op hun blog: 29 januari 2024 */
  datum: string;
  beeld: string;
  breed: number;
  hoog: number;
  samenvatting: string;
  inhoud: readonly BlogBlok[];
}

export const BLOG: readonly BlogBericht[] = [
  {
    slug: "gastvrijheid-meten-we-geven-je-5-redenen",
    titel: "Gastvrijheid meten we geven je 5 redenen",
    datum: "2024-01-29",
    beeld: beeld("blog-gastvrijheid.webp"),
    breed: 1024,
    hoog: 440,
    samenvatting:
      "Het meten van gastvrijheid is belangrijk voor bedrijven omdat het hen inzicht geeft in de ervaringen van hun gasten.",
    inhoud: [
      { type: "alinea", tekst: "Het meten van gastvrijheid is belangrijk voor bedrijven omdat het hen inzicht geeft in de ervaringen van hun gasten. Dit is nuttig om het beleid en de dienstverlening van het bedrijf te verbeteren en te verzekeren dat gasten tevreden zijn." },
      { type: "alinea", tekst: "Tevreden gasten leiden tot verhoogde klanttevredenheid, loyaliteit en mond-tot-mondreclame, wat op zijn beurt kan leiden tot een verhoogde omzet." },
      { type: "alinea", tekst: "Het belangrijkste is dat je als bedrijf laat zien dat je naar je gasten luistert en dat je ook daadwerkelijk iets met hun feedback doet. Gasten zitten niet te wachten om veel tijd (achteraf) te moeten investeren om hun tevredenheid door te geven. Wanneer ze toch moeite nemen is het belangrijk dat ze ook zien dat er ook daadwerkelijk iets met hun feedback wordt gedaan." },
      { type: "kop", tekst: "Waarom zou je gastvrijheid willen meten?" },
      { type: "alinea", tekst: "Gasten vinden het belangrijk dat je hun gastbeleving serieus neemt. Daarom waarderen ze het ook dat je met de gastvrijheid bezig bent. Wil je een hoge response op de meting van je gastvrijheid? Val gasten dan niet lastig met lange vragenlijsten maar gebruik een eenvoudige tool die ze snel kunnen invullen." },
      { type: "kop", tekst: "Hoe kun je het meten van gastvrijheid aantrekkelijk maken?" },
      { type: "alinea", tekst: "Een online survey is een eenvoudige en efficiënte manier om gastvrijheid te meten omdat het gemakkelijk toegankelijk is voor zowel het bedrijf als de gasten." },
      { type: "alinea", tekst: "Bedrijven kunnen eenvoudig een online survey (vragenlijst) ontwerpen en deze verzenden naar hun gasten, waarbij ze snel inzicht krijgen in de ervaringen en tevredenheid van hun gasten." },
      { type: "alinea", tekst: "Online surveys bieden ook de mogelijkheid om specifieke vragen te stellen, NPS Scores te meten en de resultaten te analyseren. Dit helpt het bedrijf om gericht verbeterpunten te identificeren en actie te ondernemen." },
      { type: "kop", tekst: "5 redenen om gastvrijheid te meten bij jouw bedrijf" },
      {
        type: "lijst",
        items: [
          "Verbeter de klanttevredenheid: Door gastvrijheid te meten, krijgt een bedrijf inzicht in de ervaringen van hun gasten en kan het beleid en de dienstverlening aanpassen om tevredenheid te verhogen.",
          "Verhoog de loyaliteit: Tevreden gasten zijn geneigd om terug te keren en meer geld uit te geven bij het bedrijf.",
          "Vergroot mond-tot-mondreclame: Tevreden gasten zullen positief over het bedrijf praten en hen aanbevelen aan vrienden en familie, wat de reputatie van het bedrijf versterkt.",
          "Identificeer verbeterpunten: Door gastvrijheid te meten, kan een bedrijf zwaktes in zijn dienstverlening identificeren en deze verbeteren, wat leidt tot een betere gastbeleving.",
          "Verhoog de omzet: Een verhoogde klanttevredenheid, loyaliteit en mond-tot-mondreclame leiden tot een verhoogde omzet voor het bedrijf.",
        ],
      },
      { type: "alinea", tekst: "Het meten van gastvrijheid hoeft helemaal niet duur te zijn. Er zijn verschillende goedkope online surveys (zoals Smileyapp) om dit snel, eenvoudig en op een leuke manier te doen." },
    ],
  },
  {
    slug: "voordelen-van-het-meten-van-de-klanttevredenheid",
    titel: "Voordelen van het meten van de klanttevredenheid",
    datum: "2024-01-29",
    beeld: beeld("blog-klanttevredenheid.webp"),
    breed: 1024,
    hoog: 683,
    samenvatting: "Het meten van de klanttevredenheid zorgt voor tevreden klanten én een hogere omzet.",
    inhoud: [
      { type: "alinea", tekst: "Het meten van de klanttevredenheid zorgt voor tevreden klanten én een hogere omzet. Er zijn verschillende redenen waarom het uitvoeren van klanttevredenheidsonderzoeken nuttig kan zijn voor jouw bedrijf. Hier in het kort enkele belangrijke voordelen." },
      { type: "kop", tekst: "Problemen identificeren" },
      { type: "alinea", tekst: "Klanttevredenheidsonderzoeken kunnen helpen om problemen te identificeren die zich voordoen in de interacties tussen jouw bedrijf en je klanten. Dit kan bijvoorbeeld gaan om problemen met de productkwaliteit, de dienstverlening of de website." },
      { type: "kop", tekst: "Omzet verhogen door meten van de klanttevredenheid" },
      { type: "alinea", tekst: "Door te weten wat klanten waarderen en wat hun behoeften zijn, kan het bedrijf gerichte verbeteringen aanbrengen die leiden tot een hogere omzet." },
      { type: "kop", tekst: "Verzamelen van klantfeedback" },
      { type: "alinea", tekst: "Klanttevredenheidsonderzoeken bieden een goede manier om feedback te verkrijgen van klanten, zodat het bedrijf kan weten wat goed gaat en wat verbeterd kan worden. Door het inzetten van bijvoorbeeld een online survey kun je eenvoudig de klanttevredenheid of gastvrijheid meten." },
      { type: "kop", tekst: "Meet de klantloyaliteit met de NPS score" },
      { type: "alinea", tekst: "Als klanten tevreden zijn met het bedrijf, zijn ze meer geneigd om terug te komen en het bedrijf aan te bevelen aan anderen. Dit kan leiden tot een toename van de klantloyaliteit en de terugkerende klanten. Door de NPS score van je bedrijf te meten krijg je een goede indruk hoe loyaal jouw klanten of gasten zijn." },
      { type: "kop", tekst: "Krijg inzicht in je klanten" },
      { type: "alinea", tekst: "Klanttevredenheidsonderzoeken kunnen ook helpen om inzichten te verkrijgen over hoe klanten denken over het bedrijf en zijn producten of diensten. Dit kan het bedrijf helpen om zijn marketing- en verkoopstrategieën te optimaliseren en te verbeteren." },
    ],
  },
  {
    slug: "waarom-het-meten-van-de-nps-score-nuttig-is",
    titel: "Waarom het meten van de NPS score nuttig is",
    datum: "2024-01-29",
    beeld: beeld("blog-nps.webp"),
    breed: 1024,
    hoog: 440,
    samenvatting:
      "De NPS (Net Promoter Score) is een meetmethode die bedrijven kunnen gebruiken om te bepalen hoe tevreden hun klanten zijn en hoe waarschijnlijk het is dat ze het bedrijf zullen aanbevelen aan anderen.",
    inhoud: [
      { type: "alinea", tekst: "De NPS (Net Promoter Score) is een meetmethode die bedrijven kunnen gebruiken om te bepalen hoe tevreden hun klanten zijn en hoe waarschijnlijk het is dat ze het bedrijf zullen aanbevelen aan anderen." },
      { type: "kop", tekst: "NPS score berekenen" },
      { type: "alinea", tekst: 'De NPS wordt berekend door klanten te vragen naar hun waarschijnlijkheid om het bedrijf aan te bevelen op een schaal van 0 tot 10. Klanten die een score geven van 9 of 10 worden beschouwd als "promotors", die van 7 of 8 als "passive" en die lager dan 7 als "detractors".' },
      { type: "alinea", tekst: "Er zijn verschillende redenen waarom het meten van de NPS score nuttig kan zijn voor bedrijven." },
      { type: "kop", tekst: "Krijg inzicht in de tevredenheid van je klanten" },
      { type: "alinea", tekst: "De NPS geeft een goed beeld van hoe tevreden klanten zijn met het bedrijf en de producten of diensten die ze hebben gekocht. Dit kan helpen om problemen op te sporen en op te lossen, zodat klanten tevredener zullen zijn." },
      { type: "kop", tekst: "Vergelijk met concurrentie" },
      { type: "alinea", tekst: "Door de NPS te vergelijken met die van andere bedrijven in dezelfde branche, kan het bedrijf zien hoe het zich verhoudt ten opzichte van de concurrentie. Per branche is de gemiddelde (goede) score wisselend. Ga van te voren op onderzoek uit wat de gemiddelde NPS score van jouw branche is zodat je goed kunt vergelijken met andere bedrijven." },
      { type: "kop", tekst: "Voer verbeteringen door" },
      { type: "alinea", tekst: "Door de NPS te meten, kan het bedrijf gerichte verbeteringen doorvoeren om de tevredenheid van klanten te verhogen. Het kan helpen bij het verbeteren van de klanttevredenheid en zo je NPS score weer te verhogen. Klanten vinden het fijn (en belangrijk) om te zien dat er ook daadwerkelijk iets met hun feedback gedaan wordt." },
      { type: "kop", tekst: "Verhoog je reputatie" },
      { type: "alinea", tekst: "Als het bedrijf een hoge NPS heeft, is de kans groter dat klanten het aanbevelen aan anderen. Dit kan leiden tot meer verkoop en een betere reputatie voor het bedrijf." },
      { type: "kop", tekst: "Verbeter de klantrelaties" },
      { type: "alinea", tekst: "Als klanten tevreden zijn, zijn ze minder waarschijnlijk om het bedrijf te verlaten en naar een concurrent over te stappen. Dit kan leiden tot langere klantrelaties en minder kosten voor klantenwerving." },
    ],
  },
  {
    slug: "3-manieren-om-klantonderzoek-te-doen",
    titel: "3 Manieren om klantonderzoek te doen",
    datum: "2024-01-29",
    beeld: beeld("blog-klantonderzoek.webp"),
    breed: 1024,
    hoog: 440,
    samenvatting:
      "Als ondernemer is het fijn om te weten wat klanten of gasten vinden van je dienst, je product of je evenement. In dit artikel vind je drie manieren waarop jij klantonderzoek kan doen.",
    inhoud: [
      { type: "alinea", tekst: "Als ondernemer is het fijn om te weten wat klanten of gasten vinden van je dienst, je product of je evenement. Het doen van klantonderzoek of een klanttevredenheidsonderzoek is een mooi middel om daar achter te komen." },
      { type: "alinea", tekst: "Het is prettig om regelmatig feedback te ontvangen van jouw doelgroep, dit geeft je een betere inschatting van wat hen motiveert om bij jou te kopen of juist niet. Daarnaast helpt het ook om gerichter te communiceren met je potentiële klanten. In dit artikel vind je drie manieren waarop jij klantonderzoek kan doen." },
      { type: "kop", tekst: "Klantonderzoek met een online enquête" },
      { type: "alinea", tekst: "Een online survey of enquête is een simpele en snelle manier om klantonderzoek te doen. Je plaatst de enquête op je website, via een enquêtetool of Google Forms. Je kunt tegenwoordig zelfs via je eigen Facebookpagina enquêtes uitzetten." },
      { type: "alinea", tekst: "Klinkt simpel, en dat is het ook. Maar er kleeft een nadeel aan deze manier van onderzoeken. Deze manier van onderzoeken is namelijk niet zo direct en accuraat als andere methodes. Mensen herinneren zich slechts de highlights en dieptepunten van een ervaring of product, of er zijn andere factoren die invloed hebben op hun mening. Een partner die ook iets vindt en dat deelt bijvoorbeeld. Daarmee wordt de feedback achteraf minder waardevol. Het beeld zal altijd wat vertroebeld zijn." },
      { type: "kop", tekst: "Vraag de klant persoonlijk naar zijn mening" },
      { type: "alinea", tekst: "Om meningen achteraf te voorkomen, kun je je klant of gast naar zijn of haar mening vragen, tijdens of vlak na de ervaring met jou. In de horeca gebeurt dit veel wanneer iemand je vraagt of alles naar wens was." },
      { type: "alinea", tekst: "Het voordeel van deze manier van feedback ophalen is dat je direct een gesprek kunt aangaan over eventuele klachten. Je krijgt feedback in het moment, wat de kwaliteit van je klantonderzoek ten goede komt. Maar…" },
      { type: "alinea", tekst: "Het grote nadeel van deze manier van klantonderzoek? Mensen geven sociaal gewenste antwoorden. Hoe vaak heb jij al in een restaurant gezegd dat alles naar wens was, terwijl je éigenlijk wel iets had willen zeggen van die doorgebakken varkenshaas? Of de koude friet?" },
      { type: "kop", tekst: "Anoniem, in het moment feedback vragen" },
      { type: "alinea", tekst: "Je wilt weten wat je klanten vinden en denken van jouw dienst of product. Het liefst in het moment, en individueel van elkaar, zonder teveel mening van een ander. En zonder vertroebeling van andere ervaringen gedurende de dag." },
      { type: "alinea", tekst: "Je kunt dan een tool inzetten om ín het moment op een leuke wijze feedback te laten geven. Smiley App is een app voor iOS en Android waarmee je klantonderzoek kan doen." },
      { type: "alinea", tekst: "Je klant, bezoeker of gast scant een QR code en swipet met een smiley door de vragen heen. Simpel, snel en fun. De smiley gaat lachen als je klant tevreden is, en kijkt boos wanneer je klant minder blij was met de ervaring. Daarnaast is er ruimte voor (anonieme) feedback op gepersonaliseerde vragen. Zo meet je de klanttevredenheid in het moment, individueel én eerlijk omdat het anoniem is." },
      { type: "kop", tekst: "Klantonderzoek conclusie" },
      { type: "alinea", tekst: "Voor een goed resultaat is het belangrijk dat je de juiste vragen stelt, maar ook op het juiste moment, via het juiste kanaal. Je wilt een eerlijke mening, zodat je je dienst of product kunt verbeteren. Meer tevreden mensen die terugkeren, dat is het doel dat je kunt bereiken door Smiley App in te zetten voor jouw zaak, event, dienst of product." },
      { type: "alinea", tekst: "Voor een paar tientjes per maand heb jij volledig inzicht in hoe klanten of gasten over jou denken. Ben je benieuwd hoe het werkt? Bekijk hoe simpel én fun klantonderzoek kan zijn!" },
    ],
  },
];

export function blogBericht(slug: string): BlogBericht | undefined {
  return BLOG.find((b) => b.slug === slug);
}

/** "29 januari 2024": een vaste datum zonder tijd, dus de tijdzone speelt geen rol. */
export function datumTekst(iso: string): string {
  const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  const [j, m, d] = iso.split("-").map(Number);
  return `${d ?? ""} ${MAANDEN[(m ?? 1) - 1] ?? ""} ${j ?? ""}`;
}

// ---- veelgestelde vragen (alleen antwoorden die op smileyapp.nl staan) ------------

export interface Vraag {
  vraag: string;
  antwoord: string;
}

export function veelgesteld(): Vraag[] {
  const metPrijs = PAKKETTEN.filter((p) => p.prijs !== null);
  return [
    { vraag: "Hoe werkt Smileyapp?", antwoord: `${JOIN.tekst[1]} ${JOIN.tekst[3]}` },
    {
      vraag: "Wat kost Smileyapp?",
      antwoord: `Er zijn vier pakketten. ${PAKKETTEN.map(pakketRegel).join(". ")}.`,
    },
    {
      vraag: "Hoe lang loopt een pakket minimaal?",
      antwoord: `${metPrijs.map((p) => `${p.naam}: ${looptijdTekst(p).toLowerCase()}`).join(". ")}. Het Maatwerk Pakket stel je zelf samen, zodat je exact krijgt wat je nodig hebt.`,
    },
    { vraag: "Welke soorten vragen kan ik stellen?", antwoord: `Je kunt bijvoorbeeld kiezen uit ${VRAAGSOORTEN.slice(0, -1).join(", ")} of ${VRAAGSOORTEN[VRAAGSOORTEN.length - 1] ?? ""}.` },
    { vraag: "Voor welke branches is Smileyapp geschikt?", antwoord: "Smileyapp is inzetbaar voor alle branches. Het animatiefilmpje op deze pagina laat zien hoe het in de horeca kan werken." },
    { vraag: "Kan ik de resultaten exporteren?", antwoord: "Ja. Je kunt eenvoudig de NPS-scores en gemiddelde scores exporteren in een rapport." },
    { vraag: "Kan ik de scores op mijn eigen website laten zien?", antwoord: FUNCTIES.widget },
    {
      vraag: "Is de feedback anoniem?",
      antwoord: "Er is ruimte voor (anonieme) feedback op gepersonaliseerde vragen. Zo meet je de klanttevredenheid in het moment, individueel én eerlijk omdat het anoniem is.",
    },
    { vraag: "Waarom geven mensen graag feedback met Smileyapp?", antwoord: KERNWOORDEN.items[2]?.tekst ?? "" },
    { vraag: "Kan ik partner worden?", antwoord: `${PARTNER.uitleg[2]} ${PARTNER.uitleg[3]}` },
    { vraag: "Waar log ik in als klant?", antwoord: "Via de klantlogin op smileyapp.online." },
  ];
}
