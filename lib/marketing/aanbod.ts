// Het complete aanbod van ZekerFlex op één plek. De homepage, het menu, de
// overzichtspagina /aanbod en de losse pagina's /aanbod/<slug> lezen allemaal
// uit deze lijst, zodat elk product (ook een nieuw) vanzelf overal een plek
// krijgt. Puur bestand: geen prisma/kv, dus ook bruikbaar in client-code.
//
// Prijzen staan hier alleen als ze echt vastliggen (de staffel komt uit
// lib/pricing/tiers.ts); anders "op aanvraag". Iets wat nog op een sleutel of
// keuze van de eigenaar wacht, staat op "binnenkort".

export type PijlerSleutel = "personeel" | "online" | "branche" | "geld";

export interface Pijler {
  sleutel: PijlerSleutel;
  naam: string;
  /** één regel voor tegels en het menu */
  kort: string;
  /** een paar zinnen bovenaan de band op /aanbod */
  intro: string;
}

export interface AanbodItem {
  /** /aanbod/<slug> als het geen eigen pagina elders heeft */
  slug: string;
  pijler: PijlerSleutel;
  naam: string;
  /** één regel voor kaarten en het menu */
  kort: string;
  /** twee à drie zinnen voor de eigen pagina */
  tekst: string;
  /** wat je krijgt (3–6 punten) */
  punten: string[];
  voorWie: string;
  /** alleen als de prijs vastligt; anders tonen we "op aanvraag" */
  prijs?: string;
  status: "beschikbaar" | "binnenkort";
  /** bestaande openbare pagina; zonder dit krijgt het item /aanbod/<slug> */
  pagina?: string;
  /** de knop om te beginnen */
  start: { label: string; href: string };
  /** zoekwoorden voor de eigen pagina */
  zoekwoorden?: string[];
}

export const PIJLERS: Pijler[] = [
  {
    sleutel: "personeel",
    naam: "Personeel",
    kort: "Flexwerkers, uitzendkrachten en zzp'ers, van dienst tot factuur.",
    intro:
      "Plaats een dienst en ZekerFlex stelt direct passende mensen voor. Inchecken, uren goedkeuren en factureren gaan in dezelfde omgeving.",
  },
  {
    sleutel: "online",
    naam: "Online & klanten",
    kort: "Een eigen website, meer reviews en goed bereikbaar voor klanten.",
    intro:
      "Een snelle website op je eigen domein, meer Google-reviews en een nette eerste indruk. Je website zonder cookies of trackers van anderen.",
  },
  {
    sleutel: "branche",
    naam: "Branchepakketten",
    kort: "Complete software voor jouw soort zaak, met je eigen site erbij.",
    intro:
      "Software die past bij hoe jouw zaak werkt: van reserveren en bestellen in de horeca tot lessen plannen bij een rijschool. Je zet aan wat je nodig hebt.",
  },
  {
    sleutel: "geld",
    naam: "Geld & administratie",
    kort: "Facturen, betaalverzoeken en rekenwerk zonder losse pakketten.",
    intro:
      "Facturen die vanzelf uit goedgekeurde uren komen, betaalverzoeken met een QR-code en gratis rekentools voor de vragen ertussendoor.",
  },
];

const AANMELDEN = { label: "Gratis account aanmaken", href: "/register?type=bedrijf" };
const DEMO = { label: "Vraag een demo aan", href: "/demo" };

export const AANBOD: AanbodItem[] = [
  // ── Personeel
  {
    slug: "flexwerkers-inhuren",
    pijler: "personeel",
    naam: "Flexwerkers inhuren",
    kort: "Plaats een dienst en krijg direct passende flexwerkers voorgesteld.",
    tekst:
      "Je zet een dienst uit en ZekerFlex matcht op vak, reistijd en betrouwbaarheid. Flexwerkers checken in op locatie, jij keurt de uren goed en de factuur volgt vanzelf.",
    punten: [
      "Automatisch matchen op vak, reistijd en betrouwbaarheid",
      "Inchecken op locatie en uren goedkeuren in één klik",
      "Eén factuur, uitgesplitst per vestiging of kostenplaats",
      "Wet DBA-signalen per samenwerking",
    ],
    voorWie: "Bedrijven die op piekmomenten extra handen nodig hebben",
    prijs: "€ 3,50 per gewerkt uur, lager bij meer uren",
    status: "beschikbaar",
    pagina: "/voor-bedrijven",
    start: AANMELDEN,
  },
  {
    slug: "uitzendkrachten",
    pijler: "personeel",
    naam: "Uitzendkrachten",
    kort: "ZekerFlex is de werkgever: loon, cao en pensioen zijn geregeld.",
    tekst:
      "Liever geen werkgeversrisico? Dan huur je uitzendkrachten in via ZekerFlex. Loondoorbetaling, verzuim, cao en pensioen lopen via ons.",
    punten: [
      "Geen werkgeversrisico voor jou",
      "ABU-cao en pensioen via StiPP geregeld",
      "Eén factuur per kostenplaats",
      "Logboek van elke handeling",
    ],
    voorWie: "Bedrijven die mensen langer of vaker willen inzetten",
    status: "beschikbaar",
    pagina: "/uitzendbureau",
    start: DEMO,
  },
  {
    slug: "klus-plaatsen",
    pijler: "personeel",
    naam: "Klus plaatsen zonder account",
    kort: "Stel je klus samen, zie wat het kost en hoeveel mensen er in de buurt zijn.",
    tekst:
      "Probeer eerst zonder account: je stelt de klus samen, ziet direct de kosten en hoeveel flexwerkers er bij jou in de buurt zijn. Pas bij plaatsen maak je een account.",
    punten: ["Kosten vooraf zichtbaar", "Aantal beschikbare mensen in de buurt", "Je concept blijft bewaard tot je je aanmeldt"],
    voorWie: "Iedereen die eerst wil kijken voor hij zich aanmeldt",
    prijs: "Gratis proberen",
    status: "beschikbaar",
    pagina: "/klus-plaatsen",
    start: { label: "Klus samenstellen", href: "/klus-plaatsen" },
  },
  {
    slug: "voor-bureaus",
    pijler: "personeel",
    naam: "Software voor uitzendbureaus",
    kort: "Het ZekerFlex-platform onder je eigen naam, als plug-in of op je eigen server.",
    tekst:
      "Ben je zelf een bureau? Gebruik de techniek van ZekerFlex onder je eigen merk: matching, uren, facturen en compliance.",
    punten: ["Eigen merk (white-label)", "Als plug-in of op je eigen server", "Matching, uren en facturen in één"],
    voorWie: "Uitzend- en detacheringsbureaus",
    status: "beschikbaar",
    pagina: "/voor-bureaus",
    start: DEMO,
  },
  // Netwerkpakketten (lib/netwerk/modules.ts): op de eigen server, zonder licentiekosten bij een ander.
  // "binnenkort" tot de servers erachter draaien; aanmelden kan al via Werkgever → Wifi en VPN.
  {
    slug: "wifi-op-de-werkvloer",
    pijler: "personeel",
    naam: "Wifi op de werkvloer",
    kort: "Flexwerkers krijgen vanzelf wifi zodra hun dienst begint, en raken het kwijt als die eindigt.",
    tekst:
      "Geen gedeeld wifi-wachtwoord meer op een briefje. Iedereen logt in met een eigen naam en wachtwoord uit ZekerFlex. Een flexwerker krijgt alleen toegang op de vestiging waar hij die dag ingepland staat, van een half uur voor tot een half uur na de dienst.",
    punten: [
      "Geen gedeelde wifi-wachtwoorden meer",
      "Toegang volgt het rooster: dienst begint, wifi aan",
      "Eigen medewerkers altijd toegang met hun ZekerFlex-login",
      "Beveiligd zoals bij grote bedrijven (WPA2/WPA3-Enterprise)",
    ],
    voorWie: "Kantoren, horeca, magazijnen en flexwerkplekken",
    prijs: "€ 49 per vestiging per maand",
    status: "binnenkort",
    start: { label: "Aanmelden via je werkgeversomgeving", href: "/werkgever/netwerk" },
    zoekwoorden: ["wifi voor flexwerkers", "gast wifi personeel", "wifi rooster", "radius wifi bedrijf"],
  },
  {
    slug: "veilige-werkplek",
    pijler: "personeel",
    naam: "Veilige werkplek (VPN)",
    kort: "Een versleutelde verbinding naar jullie eigen systemen, voor flexwerkers en medewerkers, waar ze ook zijn.",
    tekst:
      "Wie op afstand werkt, krijgt een eigen versleutelde tunnel naar jullie interne systemen. Elk apparaat krijgt een eenmalige toegangscode uit ZekerFlex; niets staat open op internet.",
    punten: [
      "Rechtstreekse, versleutelde verbindingen tussen apparaten",
      "Toegangscodes uit ZekerFlex, eenmalig en met een vervaldatum",
      "Zie welke apparaten verbonden zijn en zet er een af",
      "Geen Tailscale-, Cloudflare- of andere VPN-abonnementen nodig",
    ],
    voorWie: "Bedrijven met mensen op afstand, ICT en wie met gevoelige gegevens werkt",
    prijs: "€ 4 per gebruiker per maand, of € 149 per maand voor het hele bedrijf",
    status: "binnenkort",
    start: { label: "Aanmelden via je werkgeversomgeving", href: "/werkgever/netwerk" },
    zoekwoorden: ["vpn voor flexwerkers", "zakelijke vpn", "veilig thuiswerken", "zero trust netwerk mkb"],
  },
  {
    slug: "eigen-5g-netwerk",
    pijler: "personeel",
    naam: "Eigen 5G-netwerk op het terrein",
    kort: "Een eigen, afgeschermd mobiel netwerk op een bouwplaats, evenemententerrein of distributiecentrum.",
    tekst:
      "Een eigen 5G-netwerk voor handterminals, camera's, routers en machines op het terrein, los van de landelijke netwerken. ZekerFlex levert de software en het simkaartbeheer; voor de vergunning en de apparatuur beginnen we met een gesprek.",
    punten: [
      "Eigen frequentie op het terrein, onafhankelijk van de landelijke netwerken",
      "Simkaarten beheren vanuit je ZekerFlex-beheer",
      "Voorrang voor belangrijke verbindingen",
      "Apparatuur erbij tegen kostprijs plus een opslag",
    ],
    voorWie: "Bouwlocaties, evenemententerreinen, grote distributiecentra",
    prijs: "vanaf € 299 per maand, exclusief apparatuur en inrichting",
    status: "binnenkort",
    start: DEMO,
    zoekwoorden: ["private 5g netwerk", "eigen 5g bouwplaats", "campusnetwerk", "lokaal 5g netwerk bedrijf"],
  },

  // ── Online & klanten
  {
    slug: "website",
    pijler: "online",
    naam: "Website laten maken",
    kort: "Een snelle, moderne website op je eigen domein, zelf aan te passen.",
    tekst:
      "ZekerFlex bouwt een moderne website voor je zaak, op je eigen domeinnaam. Teksten en foto's pas je daarna zelf aan. De site gebruikt geen cookies en geen trackers van anderen.",
    punten: [
      "Modern ontwerp dat op elke telefoon goed werkt",
      "Je eigen domeinnaam met een beveiligde verbinding",
      "Teksten en foto's zelf aanpassen",
      "Bezoekerscijfers zonder cookies",
    ],
    voorWie: "Ondernemers die een betere website willen zonder gedoe",
    status: "beschikbaar",
    start: AANMELDEN,
    zoekwoorden: ["website laten maken", "website voor mijn bedrijf", "websitebouwer", "website zonder cookies"],
  },
  {
    slug: "domeinnaam",
    pijler: "online",
    naam: "Domeinnaam",
    kort: "Zoek of je naam vrij is: .nl, .com, .eu, .be en meer. Registreren of verhuizen.",
    tekst:
      "Zoek direct of je domeinnaam nog vrij is en vraag hem aan voor een eerlijke prijs per jaar. Heb je al een domein? Verhuis het naar ZekerFlex of koppel het aan je website.",
    punten: ["Direct zien of je naam vrij is", ".nl, .com, .eu, .be en meer", "Verhuizen met je verhuiscode", "Met een websiteabonnement het eerste jaar inbegrepen"],
    voorWie: "Iedereen die een eigen naam online wil",
    prijs: "Vanaf € 9,95 per jaar",
    status: "beschikbaar",
    pagina: "/domeinnaam",
    start: { label: "Zoek je domeinnaam", href: "/domeinnaam" },
  },
  {
    slug: "website-check",
    pijler: "online",
    naam: "Gratis website-check",
    kort: "Zie in een minuut hoe snel, vindbaar en veilig je huidige website is.",
    tekst:
      "Vul je adres in en je ziet direct waar je website punten laat liggen: snelheid, vindbaarheid in Google en veiligheid.",
    punten: ["Snelheid", "Vindbaarheid in Google", "Veiligheid en toegankelijkheid"],
    voorWie: "Iedereen met een website",
    prijs: "Gratis",
    status: "beschikbaar",
    pagina: "/website-check",
    start: { label: "Check mijn website", href: "/website-check" },
  },
  {
    slug: "review-check",
    pijler: "online",
    naam: "Gratis review-check",
    kort: "Zie hoe je bedrijf op Google scoort, naast de zaken bij jou in de buurt.",
    tekst:
      "Zoek je bedrijf op of plak je Google-link. Je ziet je score, hoe je het doet ten opzichte van de buurt en wat je kunt doen om meer en betere reviews te krijgen, met voorbeeldantwoorden op je reviews.",
    punten: ["Score en positie in de buurt", "Wat klanten vaak noemen", "Concrete verbeterpunten", "Voorbeeldantwoorden op je reviews"],
    voorWie: "Zaken die in de buurt gevonden willen worden",
    prijs: "Gratis",
    status: "beschikbaar",
    pagina: "/review-check",
    start: { label: "Check mijn reviews", href: "/review-check" },
  },
  {
    slug: "google-reviews",
    pijler: "online",
    naam: "Meer Google-reviews",
    kort: "Vraag klanten na een bezoek met één persoonlijke link om een review.",
    tekst:
      "Na een afspraak of bezoek krijgt je klant een persoonlijke link. Elke klant kan daarmee een review op Google achterlaten, of het nu een goede of minder goede ervaring was. Zo groeit je score eerlijk.",
    punten: [
      "Persoonlijke link per klant",
      "Elke klant mag een review op Google plaatsen, zoals Google het wil",
      "Overzicht van wie al gereageerd heeft",
    ],
    voorWie: "Zaken die beter gevonden willen worden in de buurt",
    status: "beschikbaar",
    start: AANMELDEN,
    zoekwoorden: ["google reviews verzamelen", "meer google reviews", "reviews vragen aan klanten"],
  },
  {
    slug: "telefonie",
    pijler: "online",
    naam: "Zakelijk nummer & AI-beller",
    kort: "Een vast zakelijk nummer, met een assistent die opneemt als jij niet kunt.",
    tekst:
      "Een zakelijk telefoonnummer dat met je meegaat, met een slimme assistent die opneemt, vragen beantwoordt en een terugbelverzoek voor je klaarzet.",
    punten: ["Zakelijk nummer", "Assistent die opneemt als jij bezig bent", "Gesprekken terug te lezen"],
    voorWie: "Zaken die geen oproep willen missen",
    status: "binnenkort",
    start: DEMO,
    zoekwoorden: ["zakelijk telefoonnummer", "ai telefoonassistent", "telefonische assistent voor mijn bedrijf"],
  },
  {
    slug: "zakelijke-mail",
    pijler: "online",
    naam: "Zakelijke e-mail",
    kort: "E-mail op je eigen domeinnaam, geregeld samen met je website.",
    tekst: "E-mailadressen op je eigen domeinnaam, zoals info@jouwzaak.nl, geregeld op dezelfde plek als je website.",
    punten: ["Adressen op je eigen domein", "Samen met je website geregeld", "Adressen beheren vanuit je ZekerFlex-account"],
    voorWie: "Ondernemers met een eigen domeinnaam",
    status: "binnenkort",
    start: DEMO,
    zoekwoorden: ["zakelijke e-mail eigen domein", "e-mail op eigen domeinnaam"],
  },

  // ── Branchepakketten
  {
    slug: "horeca",
    pijler: "branche",
    naam: "Horecasoftware",
    kort: "Reserveren, menukaart, bestellen met een QR-code, keukenscherm en takenlijsten.",
    tekst:
      "Alles voor je zaak onder één dak: gasten reserveren online, bestellen aan tafel met een QR-code en de bestelling verschijnt direct op het keuken- of barscherm. Met een menukaart met allergenen en takenlijsten voor de hygiënecode. Je betaalt per module die je aanzet.",
    punten: [
      "Online reserveren met bevestiging en annuleerlink per mail",
      "Menukaart met de 14 allergenen",
      "Bestellen aan tafel met een QR-code",
      "Keuken- en barscherm",
      "Takenlijsten en registratie voor de hygiënecode",
      "Eigen website voor je zaak",
    ],
    voorWie: "Restaurants, cafés, lunchrooms en strandtenten",
    prijs: "Abonnement per module",
    status: "beschikbaar",
    start: AANMELDEN,
    zoekwoorden: ["horeca software", "reserveringssysteem restaurant", "qr bestellen", "haccp takenlijst", "kassasysteem horeca"],
  },
  {
    slug: "rijschool",
    pijler: "branche",
    naam: "Rijschoolsoftware",
    kort: "Website met proefles-aanvraag, een app voor leerlingen en voor instructeurs.",
    tekst:
      "Een complete omgeving voor je rijschool: een website waarop leerlingen een proefles aanvragen, een app waarin ze hun lessen en voortgang zien en een app voor instructeurs. Lestegoed en planning zitten erin.",
    punten: [
      "Website met proefles-aanvraag",
      "App voor leerlingen: lessen, voortgang en tegoed",
      "App voor instructeurs",
      "Planning en lestegoed",
    ],
    voorWie: "Rijscholen en zelfstandige instructeurs",
    status: "beschikbaar",
    start: AANMELDEN,
    zoekwoorden: ["rijschool software", "rijschool planning", "rijschool app", "lesplanner rijschool"],
  },

  // ── Geld & administratie
  {
    slug: "facturen-en-betalen",
    pijler: "geld",
    naam: "Facturen & betaalverzoeken",
    kort: "Facturen komen vanzelf uit goedgekeurde uren; betaalverzoeken met een QR-code.",
    tekst:
      "Keur je uren goed, dan maakt ZekerFlex de factuur. Moet een klant jou betalen? Stuur een betaalverzoek met een link of QR-code.",
    punten: ["Facturen vanzelf uit goedgekeurde uren", "Betaalverzoek met link of QR-code", "Overzicht van wat open staat"],
    voorWie: "Bedrijven die minder tijd aan administratie willen kwijt zijn",
    status: "beschikbaar",
    start: AANMELDEN,
    zoekwoorden: ["facturen uit urenregistratie", "betaalverzoek qr code"],
  },
  {
    slug: "rekentools",
    pijler: "geld",
    naam: "Gratis rekentools",
    kort: "Uurtarief, kosten van een uitzendkracht en de Wet DBA-check.",
    tekst: "Snel antwoord op de rekenvragen die bij flexwerk horen, gratis en zonder account.",
    punten: ["Zzp-uurtarief berekenen", "Kosten van een uitzendkracht", "Wet DBA-check"],
    voorWie: "Ondernemers en zzp'ers",
    prijs: "Gratis",
    status: "beschikbaar",
    pagina: "/rekentools",
    start: { label: "Naar de rekentools", href: "/rekentools" },
  },
];

/** Voor wie werk zoekt: een eigen ingang, los van het aanbod voor bedrijven. */
export const WERK_ZOEKEN: { naam: string; kort: string; href: string }[] = [
  { naam: "Open klussen", kort: "Diensten bij jou in de buurt, op vak en reistijd.", href: "/klussen" },
  { naam: "Starten als freelancer", kort: "Van aanmelding tot je eerste dienst.", href: "/voor-freelancers" },
  { naam: "Werken als uitzendkracht", kort: "Loonstrook, vakantiegeld en pensioen.", href: "/uitzendbureau" },
  { naam: "Download de app", kort: "Diensten, uren en uitbetaling op je telefoon.", href: "/app" },
];

/** Waar de kaart of het menu naartoe linkt. */
export const aanbodHref = (a: AanbodItem): string => a.pagina ?? `/aanbod/${a.slug}`;

/** De items die een eigen /aanbod/<slug>-pagina krijgen. */
export const eigenPaginas = (): AanbodItem[] => AANBOD.filter((a) => !a.pagina);

export const aanbodVan = (slug: string): AanbodItem | undefined => eigenPaginas().find((a) => a.slug === slug);

export const pijlerVan = (s: PijlerSleutel): Pijler => {
  const p = PIJLERS.find((x) => x.sleutel === s);
  if (!p) throw new Error(`Onbekende pijler ${s}`);
  return p;
};

export const aanbodPerPijler = (s: PijlerSleutel): AanbodItem[] => AANBOD.filter((a) => a.pijler === s);

export const prijsTekst = (a: AanbodItem): string => a.prijs ?? "Op aanvraag";
