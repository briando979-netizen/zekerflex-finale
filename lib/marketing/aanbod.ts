// Het complete aanbod van ZekerFlex op één plek. De homepage, het menu, de
// overzichtspagina /aanbod en de losse pagina's /aanbod/<slug> lezen allemaal
// uit deze lijst, zodat elk product (ook een nieuw) vanzelf overal een plek
// krijgt. Puur bestand: geen prisma/kv, dus ook bruikbaar in client-code.
//
// Prijzen staan hier alleen als ze echt vastliggen (de staffel komt uit
// lib/pricing/tiers.ts); anders "op aanvraag". Iets wat nog niet bestaat of op een
// sleutel of keuze van de eigenaar wacht, hoort hier niet (nergens "binnenkort";
// 22 nov 2026: de status "binnenkort" en zijn labels zijn weggehaald).
//
// 28 nov 2026: de twee netwerkpakketten (wifi op de werkvloer, veilige werkplek) en de vier
// op-locatiemodules (portofoon in de app, toegang op kenteken, sleutelkluis, badges en labels
// printen) staan hier niet meer. Bij de opruiming van fase C op 22 november zijn hun
// werkgeversschermen weggehaald (/werkgever/netwerk en /werkgever/op-locatie bestaan niet meer) en
// sturen hun pagina's /aanbod/<slug> door naar /bedrijven — maar de items bleven staan. Gemeten op
// 28 november: op /aanbod stonden daardoor zes kaarten die je naar /bedrijven kaatsten, met een knop
// "Aanzetten in je werkgeversomgeving" naar een scherm dat er niet meer is. Het beheermenu noemt
// deze modules zelf al "buiten het flexwerk-platform" (/admin/op-locatie blijft, om te kijken). De
// omleidingen in next.config.mjs blijven staan voor oude links uit Google; de foto's blijven in
// public/aanbod, zodat dit terug te draaien is als de eigenaar ze weer wil verkopen.

import type { Werkruimte } from "@/lib/werkgever/werkruimte";
import { BTW_TEKST, STANDAARD_PRIJZEN, vanafTekst } from "@/lib/advertentie/regels";

/** Echte schermen van de horecasoftware (voorbeeldzaak "Restaurant De Proef", 15 nov 2026); maten in beeldpunten van het bestand. */
const HORECA_INKIJK: InkijkScherm[] = [
  { bestand: "horeca-kassa.webp", titel: "De kassa", tekst: "Snel verkopen op naam of nummer, korting per btw-tarief, fooi en afrekenen met pin of contant.", alt: "Het kassascherm met een snelle verkoop, 10% korting en de knoppen Pin en Contant", breedte: 1600, hoogte: 1075 },
  { bestand: "horeca-bord.webp", titel: "Het bestellingenbord", tekst: "Elke bestelling als tegel, de tijd groot voorop. Amber wacht op jou, blauw is gepland, groen is onderweg.", alt: "Het bestellingenbord met bezorgingen en afhaalbestellingen in de kolommen Nieuw en Bezig", breedte: 1600, hoogte: 678 },
  { bestand: "horeca-online-bestellen-telefoon.webp", titel: "Bestellen voor gasten", tekst: "Gasten bestellen op je eigen site om af te halen of te laten bezorgen, met een tijd van vandaag.", alt: "De bestelpagina voor gasten op een telefoon", breedte: 780, hoogte: 1688, toestel: "telefoon" },
  { bestand: "horeca-kaart.webp", titel: "De bezorgkaart", tekst: "Je zaak en alle open bezorgingen op de kaart; een tik op een speld opent de bestelling.", alt: "De bestellingenkaart van Amsterdam met de zaak en de open bezorgingen", breedte: 1600, hoogte: 758 },
  { bestand: "horeca-archief.webp", titel: "Het archief", tekst: "Alle bestellingen met filters, de omzet en de btw per tarief, en als CSV te downloaden.", alt: "Het archief met de omzet en de btw per tarief", breedte: 1600, hoogte: 778 },
];

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
  status: "beschikbaar";
  /** bestaande openbare pagina; zonder dit krijgt het item /aanbod/<slug> */
  pagina?: string;
  /** de knop om te beginnen */
  start: { label: string; href: string };
  /** een tweede knop naar voorbeelden om eerst rond te kijken (bv. /voorbeeldsites) */
  voorbeelden?: { label: string; href: string };
  /** zoekwoorden voor de eigen pagina */
  zoekwoorden?: string[];
  /** foto in public/aanbod (bron en licentie in public/aanbod/CREDITS.md) */
  foto?: { bestand: string; alt: string };
  /**
   * Echte schermen van het product ("inkijk"), in public/aanbod/inkijk: opgenomen op een tijdelijke voorbeeldzaak met
   * verzonnen voorbeeldgegevens (vermeld in CREDITS.md). De eerste staat ook in de kop.
   */
  inkijk?: InkijkScherm[];
  /** een luisterdemo onder de kop: een gesprek tussen de assistent en een testklant (components/marketing/aanbod/TelefonieDemo.tsx) */
  luisterdemo?: true;
}

export interface InkijkScherm {
  bestand: string;
  titel: string;
  tekst: string;
  alt: string;
  breedte: number;
  hoogte: number;
  /** een scherm van de telefoon krijgt een telefoonkader */
  toestel?: "telefoon";
}

export const PIJLERS: Pijler[] = [
  {
    sleutel: "personeel",
    naam: "Personeel",
    kort: "Flexwerkers, uitzendkrachten en zzp'ers, van dienst tot factuur.",
    intro:
      "Plaats een dienst: hij komt bij geverifieerde werkers in de buurt en jij kiest wie je inroostert. Inchecken, uren goedkeuren en factureren gaan in dezelfde omgeving.",
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
    kort: "Facturen, e-facturen en rekenwerk zonder losse pakketten.",
    intro:
      "Facturen die vanzelf uit goedgekeurde uren komen, ook als e-factuur voor je boekhoudpakket, en gratis rekentools voor de vragen ertussendoor.",
  },
];

const AANMELDEN = { label: "Gratis account aanmaken", href: "/register?type=bedrijf" };
/** Een product met een eigen dashboard: aanmelden opent meteen dat dashboard (lib/auth/aanmelden-dashboard.ts). */
const aanmeldenVoor = (soort: Exclude<Werkruimte, "personeel">) => ({ label: AANMELDEN.label, href: `/register?type=bedrijf&dashboard=${soort}` });
const DEMO = { label: "Vraag een demo aan", href: "/demo" };

export const AANBOD: AanbodItem[] = [
  // ── Personeel
  {
    slug: "flexwerkers-inhuren",
    pijler: "personeel",
    naam: "Flexwerkers inhuren",
    kort: "Plaats een dienst bij geverifieerde flexwerkers in de buurt en kies zelf wie je inroostert.",
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
    pagina: "/bedrijven",
    start: AANMELDEN,
  },
  {
    slug: "uitzendkrachten",
    pijler: "personeel",
    naam: "Uitzendkrachten",
    // 21 nov 2026: ZekerFlex is zelf geen uitzender meer; uitzendkrachten lopen via een aangesloten uitzendbureau
    kort: "Via een aangesloten uitzendbureau: dat bureau is de werkgever en regelt loon, cao en pensioen.",
    tekst:
      "Liever geen werkgeversrisico? Dan krijg je uitzendkrachten via een aangesloten uitzendbureau. Het bureau is de werkgever: contract, loon, verzuim, cao en pensioen lopen via het bureau. ZekerFlex brengt je met het bureau in contact.",
    punten: [
      "Geen werkgeversrisico voor jou",
      "Contract, loon en pensioen via het uitzendbureau, volgens zijn cao",
      "Inchecken en uren in de ZekerFlex-app",
      "Aanvragen via contact: wij brengen je in contact met een bureau",
    ],
    voorWie: "Bedrijven die mensen langer of vaker willen inzetten",
    status: "beschikbaar",
    // 21 nov: de oude uitzendpagina met het aanvraagformulier is weg (/uitzendbureau stuurt door naar de uitleg voor werkers);
    // een bedrijf dat uitzendkrachten zoekt, komt bij personeel inhuren en vraagt ze aan via contact
    pagina: "/personeel-inhuren",
    start: { label: "Vraag uitzendkrachten aan", href: "/contact" },
  },
  {
    slug: "inchecken-op-locatie",
    pijler: "personeel",
    naam: "Inchecken op locatie",
    kort: "Een tablet bij de ingang: krachten checken in met QR, NFC-sticker of sleutelhanger.",
    tekst:
      "Zet een tablet of oud toestel bij de ingang en je hebt een incheckterminal. De kracht scant de QR-code die elke minuut verandert, houdt zijn telefoon tegen de ZekerFlex-sticker of tikt met een NFC-sleutelhanger. De tijd staat meteen in het urenbriefje, zonder app open te doen.",
    punten: [
      "Werkt op elke tablet of telefoon met een browser, geen apparaat te kopen",
      "QR-code die elke minuut wisselt: niet thuis te scannen",
      "NFC-sticker en sleutelhanger voor wie zonder telefoon wil inchecken",
      "In- en uitchecktijden direct in het urenbriefje",
      "Vestigingsadres wordt vastgelegd, niet de locatie van de kracht",
    ],
    voorWie: "Horeca, magazijnen, productie en evenementen met een vaste ingang",
    prijs: "Inbegrepen bij ZekerFlex, geen extra kosten",
    status: "beschikbaar",
    start: AANMELDEN,
    zoekwoorden: ["inchecken personeel", "nfc inchecken", "prikklok tablet", "tijdregistratie flexwerkers", "kiosk inchecken"],
    foto: { bestand: "campagne-deuropening.jpg", alt: "Een medewerker met een dienblad onder de arm staat in de deuropening van een café" },
  },
  {
    slug: "certificaten-in-een-foto",
    pijler: "personeel",
    naam: "Certificaten in één foto",
    kort: "Een foto van een VCA- of BHV-diploma en de gegevens staan ingevuld, gelezen op onze eigen server.",
    tekst:
      "Een kracht maakt een foto van zijn diploma en ZekerFlex leest het soort certificaat, het nummer en de vervaldatum er zelf uit. Dat gebeurt op onze eigen server, zonder externe dienst, dus de foto blijft bij ons. Verloopt een certificaat, dan krijgt de kracht op tijd een seintje en zie jij het in het profiel.",
    punten: [
      "Soort, nummer, afgifte- en vervaldatum vooraf ingevuld",
      "VCA, BHV, EHBO, heftruck, rijbewijzen en meer",
      "Leest Nederlands en Engels, ook scheve telefoonfoto's",
      "Verloopt een certificaat, dan weet iedereen het op tijd",
      "Geen externe leesdienst: de foto verlaat onze server niet",
    ],
    voorWie: "Opdrachtgevers die certificaten eisen en krachten die ze snel willen toevoegen",
    prijs: "Inbegrepen bij ZekerFlex, geen extra kosten",
    status: "beschikbaar",
    start: AANMELDEN,
    zoekwoorden: ["vca certificaat registreren", "certificaten personeel bijhouden", "diploma scannen", "ocr certificaat", "vervaldatum vca"],
    foto: { bestand: "campagne-monteur.jpg", alt: "Een monteur draait met een ratelsleutel een bout vast op een stalen constructie" },
  },
  {
    slug: "spoedoproep",
    pijler: "personeel",
    naam: "Spoedoproep",
    kort: "Vandaag nog iemand nodig? Eén oproep naar krachten in de buurt; wie 1 antwoordt, staat ingepland.",
    tekst:
      "Valt iemand uit, dan stuur je vanuit de dienst één spoedoproep. Geschikte krachten binnen 10, 25 of 50 kilometer krijgen een melding in de app en, als je dat aanzet, een sms of WhatsApp. Antwoorden ze met 1, dan staan ze meteen ingepland met alle gewone controles. Je ziet live wie is bereikt en wie ja zei.",
    punten: [
      "Kies een straal rond de vestiging: 10, 25 of 50 km",
      "Melding in de app, sms en WhatsApp in de taal van de kracht",
      "Antwoord 1 = ingepland, 2 = nee; nooit dubbel geboekt",
      "Live overzicht van wie is bereikt en wie heeft geantwoord",
      "Alleen krachten die passen bij het werk en niet door jou zijn geblokkeerd",
    ],
    voorWie: "Iedereen die weleens op de dag zelf een invaller zoekt",
    prijs: "Inbegrepen bij ZekerFlex; sms via je eigen Twilio-tarief",
    status: "beschikbaar",
    start: AANMELDEN,
    zoekwoorden: ["invaller vandaag", "spoed personeel", "last minute personeel", "ziekmelding vervanging", "oproepkracht sms"],
    foto: { bestand: "campagne-bezorger.jpg", alt: "Een bezorger met een grote rugzak kijkt op van zijn telefoon" },
  },
  {
    slug: "roosterplanner",
    pijler: "personeel",
    naam: "Automatische roosterplanner",
    kort: "Een week vol diensten in seconden ingepland: alle plekken gevuld tegen de laagste kosten.",
    tekst:
      "Zet je open diensten van de week klaar en de planner legt de puzzel: wie heeft het juiste certificaat, wie woont dichtbij, wie heeft nog uren over en wie is betrouwbaar? Je krijgt een rooster met de kosten per dienst en stuurt de aanbiedingen met één klik naar de gekozen krachten. Zij accepteren in de app.",
    punten: [
      "Houdt rekening met certificaten (VCA, BHV), vak, reisafstand en rust",
      "Nooit boven 60 uur per week, nooit twee diensten tegelijk",
      "Kiest op kosten, betrouwbaarheid of een balans daartussen",
      "Laat zien wat open blijft en waarom",
      "Rekent exact uit met Google OR-Tools op je eigen server",
    ],
    voorWie: "Bedrijven die wekelijks tientallen diensten moeten vullen",
    prijs: "Inbegrepen bij flexwerkers inhuren",
    status: "beschikbaar",
    start: AANMELDEN,
    zoekwoorden: ["roosterplanner", "automatisch roosteren", "personeelsplanning software", "rooster maken flexwerkers", "planning optimaliseren"],
    foto: { bestand: "campagne-rooster.jpg", alt: "Een eigenaar bekijkt een rooster op een tablet terwijl zijn team de zaak klaarmaakt" },
  },
  {
    slug: "automatisch-inchecken",
    pijler: "personeel",
    naam: "Automatisch in- en uitchecken",
    kort: "Geen knop meer: op de locatie checkt de kracht vanzelf in, bij vertrek vanzelf uit.",
    tekst:
      "Hang een QR-code of een Bluetooth-baken van een paar euro bij de ingang, of gebruik alleen de geofence van je vestiging. De telefoon van de kracht merkt dat hij op de werkplek is en checkt in; bij vertrek checkt hij uit. De uren staan meteen klaar om goed te keuren, met het bewijs erbij.",
    punten: [
      "Automatisch inchecken op de geofence van je vestiging, zonder app-winkel",
      "QR-poster per locatie, zelf te printen",
      "Bluetooth-baken (BLE) als extra bewijs, jaren op één batterij",
      "Geen gps-stuiters: pas na twee metingen binnen, uitchecken na vijf minuten buiten",
      "Bewijs per urenbriefje zichtbaar bij het goedkeuren",
    ],
    voorWie: "Bouw, logistiek, evenementen en horeca: overal waar veel mensen tegelijk beginnen",
    prijs: "Inbegrepen bij flexwerkers inhuren",
    status: "beschikbaar",
    start: AANMELDEN,
    zoekwoorden: ["automatisch inchecken personeel", "urenregistratie geofence", "qr code inchecken", "ble beacon aanwezigheid", "tijdregistratie zonder knop"],
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
    punten: ["Eigen merk (white-label)", "Als plug-in of op je eigen server", "Matching, uren en facturen in één", "Foutopsporing en prestatiebewaking op je eigen server (GlitchTip, Grafana), zonder abonnementen"],
    voorWie: "Uitzend- en detacheringsbureaus",
    status: "beschikbaar",
    pagina: "/voor-bureaus",
    start: DEMO,
  },

  // ── Online & klanten
  {
    slug: "website",
    pijler: "online",
    naam: "Website laten bouwen",
    kort: "Een snelle, moderne website op je eigen domein, zelf aan te passen.",
    tekst:
      "Met Website bouwen kies je een ontwerp voor je branche, controleer je je gegevens en pas je teksten en foto's zelf aan. Je website staat op je eigen domeinnaam en gebruikt geen cookies en geen trackers van anderen. Het is een eigen werkruimte, los van de webshop.",
    punten: [
      "Startpunt per branche, direct een complete website",
      "Modern ontwerp dat op elke telefoon goed werkt",
      "Je eigen domeinnaam met een beveiligde verbinding",
      "Teksten, foto's en stijl zelf aanpassen",
      "Bezoekerscijfers zonder cookies",
    ],
    voorWie: "Ondernemers die een betere website willen zonder gedoe",
    status: "beschikbaar",
    start: aanmeldenVoor("website"),
    voorbeelden: { label: "Bekijk wat we maakten", href: "/website-maken#voorbeelden" },
    zoekwoorden: ["website laten bouwen", "website laten maken", "website voor mijn bedrijf", "websitebouwer", "website zonder cookies"],
    foto: { bestand: "campagne-webwinkel.jpg", alt: "Een winkeleigenaar zit met een laptop en een pakketje aan de toonbank van haar winkel" },
  },
  {
    slug: "webshop",
    pijler: "online",
    naam: "Webshop openen",
    kort: "Een eigen webwinkel met producten, bestellingen, klanten, kortingen en verzending.",
    tekst:
      "Met Webshop openen start je een eigen webwinkel op een eigen werkruimte, los van je website. Je kiest een startpunt, zet je producten erin en volgt bestellingen en klanten op één plek. De wettelijke pagina's, zoals verzenden en retourneren en voorwaarden, staan als begin al klaar.",
    punten: [
      "Startpunten voor verschillende soorten winkels",
      "Producten met foto's, prijzen en voorraad",
      "Bestellingen en klanten op één plek",
      "Kortingen en verzendinstellingen",
      "Wettelijke pagina's als begin klaar",
      "Eigen domeinnaam te koppelen",
    ],
    voorWie: "Ondernemers die producten online willen verkopen",
    status: "beschikbaar",
    start: aanmeldenVoor("webshop"),
    voorbeelden: { label: "Vertel je wensen", href: "/website-maken#aanvraag" },
    zoekwoorden: ["webshop openen", "eigen webwinkel starten", "webshop beginnen", "webwinkel laten maken"],
    foto: { bestand: "campagne-vouwen.jpg", alt: "Een winkelmedewerker vouwt shirts op de toonbank" },
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
    slug: "advertentie-op-maat",
    pijler: "online",
    naam: "Advertentie op maat",
    kort: "Vul een paar dingen in en zie meteen je eigen advertentie, in zes ontwerpen.",
    tekst:
      "Je vertelt wat je bedrijf aanbiedt en kiest een kleur. Je ziet direct zes ontwerpen van je advertentie. Het voorbeeld kost niets; je betaalt pas als je hem wilt hebben.",
    punten: ["Zes ontwerpen in jouw kleur", "Eerst het voorbeeld, dan pas betalen", "Vierkant, verhaal en liggend formaat", "Geen account nodig"],
    voorWie: "Bedrijven die zelf willen adverteren",
    // dezelfde bron als de pagina zelf (lib/advertentie/regels.ts)
    prijs: `${vanafTekst()} ${BTW_TEKST}, je ziet eerst het voorbeeld`,
    status: "beschikbaar",
    pagina: "/advertentie-op-maat",
    start: { label: "Maak mijn advertentie", href: "/advertentie-op-maat" },
  },
  {
    slug: "logo-maker",
    pijler: "online",
    naam: "Logo maker",
    kort: "Vul je bedrijfsnaam in en zie meteen negen logo's in jouw kleur en sfeer.",
    tekst:
      "Je vult je bedrijfsnaam in en kiest een kleur en een sfeer. Je ziet direct negen logo's, gemaakt uit je naam met vaste ontwerpregels. Het voorbeeld kost niets; je betaalt pas als je er een wilt hebben.",
    punten: ["Negen logo's met jouw naam", "Eerst het voorbeeld, dan pas betalen", "In kleur, wit, zwart en als icoon", "Geen account nodig"],
    voorWie: "Starters en bedrijven zonder logo",
    // dezelfde bron als de pagina zelf (lib/advertentie/regels.ts)
    prijs: `${STANDAARD_PRIJZEN.logo} ${BTW_TEKST}, je ziet eerst het voorbeeld`,
    status: "beschikbaar",
    pagina: "/logo-maker",
    start: { label: "Maak mijn logo", href: "/logo-maker" },
  },
  {
    slug: "starters",
    pijler: "online",
    naam: "Voor starters: van idee tot merk",
    kort: "Logo, domeinnaam, website en je eerste advertentie. Eerst zien, dan pas betalen.",
    tekst:
      "Begin je een bedrijf? Je regelt hier je logo, je domeinnaam, je website en je eerste advertentie. Je ziet steeds eerst het voorbeeld en betaalt alleen voor wat je afneemt.",
    punten: ["Logo en advertentie: eerst het voorbeeld", "Domeinnaam: gratis zoeken of hij vrij is", "Website en webshop: eerst voorbeelden bekijken", "Geen pakket dat je in één keer moet afnemen"],
    voorWie: "Starters en mensen met een idee",
    prijs: "Je betaalt alleen voor wat je afneemt",
    status: "beschikbaar",
    pagina: "/starters",
    start: { label: "Bekijk wat er kan", href: "/starters" },
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
    foto: { bestand: "campagne-bediening.jpg", alt: "Een medewerker leunt op de bar terwijl collega's met borden langslopen" },
  },
  {
    slug: "telefonie",
    pijler: "online",
    naam: "Zakelijk nummer & AI-beller",
    kort: "Een vast zakelijk nummer, met een assistent die opneemt als jij niet kunt.",
    tekst:
      "Een zakelijk telefoonnummer met doorschakelen binnen je openingstijden, een keuzemenu of teamnummer, en een assistent die opneemt als jij niet kunt: hij noteert de vraag en naam van de beller en zet een terugbelverzoek voor je klaar. Voicemail en sms komen in ZekerFlex, met een melding.",
    punten: [
      "Nieuw mobiel nummer, of je eigen nummer houden",
      "Doorschakelen binnen je openingstijden, ook naar een team",
      "Assistent die opneemt als jij bezig bent en een terugbelverzoek klaarzet",
      "Voicemail als geluid en uitgeschreven tekst",
    ],
    voorWie: "Zaken die geen oproep willen missen",
    // 16 nov: per klantlijn gebouwd (lib/telephony/lijn.ts): doorschakelen, keuzemenu, team, assistent, voicemail, opnemen, sms
    status: "beschikbaar",
    start: AANMELDEN,
    zoekwoorden: ["zakelijk telefoonnummer", "ai telefoonassistent", "telefonische assistent voor mijn bedrijf"],
    luisterdemo: true,
  },
  {
    slug: "zakelijke-mail",
    pijler: "online",
    naam: "Zakelijke e-mail",
    kort: "Een mailadres op je eigen domein, zoals info@jouwzaak.nl, in je ZekerFlex-account.",
    // 16 nov 2026 (eigenaar: "binnenkort weg, maak het echt"): lib/mail/zf-accounts.ts, op een domein dat via ZekerFlex is gekocht of verhuisd
    tekst:
      "Een mailadres op je eigen domeinnaam, zoals info@jouwzaak.nl. Je kiest het in je ZekerFlex-account onder Mail, op een domein dat je via ZekerFlex hebt gekocht of verhuisd. Wij zetten de mailinstellingen van je domein goed; je leest en verstuurt je mail op dezelfde plek als de rest van je bedrijf.",
    punten: [
      "Een adres op je eigen domein, zoals info@jouwzaak.nl",
      "De mailinstellingen van je domein (MX, SPF, DKIM) zetten wij goed",
      "Lezen en versturen in je ZekerFlex-account, onder Mail",
      "Op een domein dat je via ZekerFlex koopt of verhuist",
    ],
    voorWie: "Ondernemers met een eigen domeinnaam",
    status: "beschikbaar",
    start: { label: "Begin met je domeinnaam", href: "/domeinnaam" },
    zoekwoorden: ["zakelijke e-mail eigen domein", "e-mail op eigen domeinnaam"],
    foto: { bestand: "campagne-barista.jpg", alt: "Een barista schenkt melk in een cappuccino achter de koffiebar" },
  },

  // ── Branchepakketten
  {
    slug: "horeca",
    pijler: "branche",
    naam: "Horecasoftware",
    kort: "Reserveren, bestellen met een QR-code, afhalen en bezorgen, kassa, keukenscherm en takenlijsten.",
    tekst:
      "Alles voor je zaak onder één dak: gasten reserveren online, bestellen aan tafel met een QR-code en de bestelling verschijnt direct op het keuken- of barscherm. Met een menukaart met allergenen en takenlijsten voor de hygiënecode. Je betaalt per module die je aanzet.",
    punten: [
      "Online reserveren met bevestiging en annuleerlink per mail",
      "Bestellen aan tafel met een QR-code, met keuken- en barscherm",
      "Afhalen en bezorgen met bord en kaart: tijd, afstand en bezorgers",
      "Kassa met bon en dagafsluiting, en een archief met omzet en btw",
      "Menukaart met de 14 allergenen en takenlijsten voor de hygiënecode",
      "Eigen website voor je zaak",
    ],
    voorWie: "Restaurants, cafés, lunchrooms en strandtenten",
    prijs: "Abonnement per module",
    status: "beschikbaar",
    start: aanmeldenVoor("horeca"),
    inkijk: HORECA_INKIJK,
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
    // de uitgebreide pagina (app/(marketing)/rijschool-software); /aanbod/rijschool stuurt daarheen door
    pagina: "/rijschool-software",
    start: aanmeldenVoor("rijschool"),
    voorbeelden: { label: "Bekijk alles voor rijscholen", href: "/rijschool-software" },
    zoekwoorden: ["rijschool software", "rijschool planning", "rijschool app", "lesplanner rijschool"],
  },

  // ── Geld & administratie
  {
    slug: "facturen-en-betalen",
    pijler: "geld",
    naam: "Facturen uit je uren",
    kort: "Facturen komen vanzelf uit goedgekeurde uren, ook als e-factuur voor je boekhouding.",
    tekst:
      "Keur je uren goed, dan maakt ZekerFlex de factuur, met een e-factuur die je boekhoudpakket zelf inleest. Je ziet wat er openstaat en betaalt per overschrijving.",
    punten: ["Facturen vanzelf uit goedgekeurde uren", "Ook als e-factuur (UBL) voor je boekhoudpakket", "Overzicht van wat open staat"],
    voorWie: "Bedrijven die minder tijd aan administratie willen kwijt zijn",
    status: "beschikbaar",
    start: AANMELDEN,
    zoekwoorden: ["facturen uit urenregistratie", "factuur uit uren", "e-factuur"],
    foto: { bestand: "campagne-klembord.jpg", alt: "Een medewerker met werkhandschoenen schrijft op een klembord naast een stapel steigerbuizen" },
  },
  {
    slug: "bedrijfscheck",
    pijler: "geld",
    naam: "Btw-nummer en KVK-check",
    kort: "Controleer gratis een btw-nummer (alle EU-landen) of KVK-nummer voordat je zaken doet.",
    tekst:
      "Typ een btw-nummer of KVK-nummer en je ziet in een paar seconden of het klopt: btw-nummers worden rechtstreeks bij VIES van de Europese Commissie gecontroleerd, KVK-nummers linken naar het Handelsregister. Op ZekerFlex gebeurt dezelfde controle vanzelf bij elk bedrijf en elke zzp'er die zich aanmeldt.",
    punten: [
      "Btw-nummers uit alle EU-landen, via VIES",
      "KVK-nummer op vorm gecontroleerd, met zoeklink in het Handelsregister",
      "Naam en adres erbij waar het land dat vrijgeeft",
      "Gratis, zonder account; niets wordt bewaard",
      "Elke aanmelding op ZekerFlex wordt zo automatisch gecontroleerd",
    ],
    voorWie: "Ondernemers die een nieuwe leverancier, klant of zzp'er willen nakijken",
    prijs: "Gratis",
    status: "beschikbaar",
    pagina: "/rekentools/btw-nummer-check",
    start: { label: "Controleer een nummer", href: "/rekentools/btw-nummer-check" },
    zoekwoorden: ["btw nummer controleren", "vies check", "kvk nummer controleren", "btw id check"],
    foto: { bestand: "campagne-ondernemer.jpg", alt: "Een ondernemer in een donker pak zit op een trap tussen kantoorgebouwen" },
  },
  {
    slug: "e-facturatie",
    pijler: "geld",
    // 16 nov 2026: "(UBL / Peppol)" weg; versturen via het Peppol-netwerk kan pas met een toegangspunt (lib/efactuur, owner-todo)
    naam: "E-facturatie (UBL)",
    kort: "Elke factuur ook als e-factuur die je boekhoudpakket direct inleest, zonder overtypen.",
    tekst:
      "Elke factuur van ZekerFlex is ook een e-factuur volgens de Europese norm (UBL, Peppol BIS 3 / NLCIUS). Je boekhoudpakket leest hem direct in: geen overtypen, geen fouten. Download het bestand per factuur of laat het automatisch naar je pakket mailen.",
    punten: [
      "UBL-bestand bij elke factuur, volgens EN 16931 / Peppol BIS 3",
      "Automatisch naar het mailadres van je boekhoudpakket",
      "Per factuur te downloaden, ook voor je boekhouder",
      "Vooraf gecontroleerd op de bedrijfsregels die pakketten afkeuren",
      "Werkt met Exact, Twinfield, e-Boekhouden, Moneybird, AFAS en meer",
    ],
    voorWie: "Bedrijven en zzp'ers die hun administratie zonder handwerk willen bijhouden",
    prijs: "Inbegrepen",
    status: "beschikbaar",
    start: AANMELDEN,
    zoekwoorden: ["e-factuur", "ubl factuur", "peppol factuur", "e-facturatie", "factuur inlezen boekhoudpakket"],
  },
  {
    slug: "rekentools",
    pijler: "geld",
    naam: "Gratis rekentools",
    kort: "Uurtarief, kosten van een uitzendkracht, de Wet DBA-check en de btw-nummer check.",
    tekst: "Snel antwoord op de rekenvragen die bij flexwerk horen, gratis en zonder account.",
    punten: ["Zzp-uurtarief berekenen", "Kosten van een uitzendkracht", "Wet DBA-check", "Btw-nummer en KVK-check"],
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
  { naam: "Werken als uitzendkracht", kort: "Zonder KVK, via een aangesloten uitzendbureau.", href: "/starten-als-uitzendkracht" },
  { naam: "Download de app", kort: "Diensten, uren en uitbetaling op je telefoon.", href: "/app" },
];

/** Waar de kaart of het menu naartoe linkt. */
export const aanbodHref = (a: AanbodItem): string => a.pagina ?? `/aanbod/${a.slug}`;

/** De items die een eigen /aanbod/<slug>-pagina krijgen. */
export const eigenPaginas = (): AanbodItem[] => AANBOD.filter((a) => !a.pagina);

export const aanbodVan = (slug: string): AanbodItem | undefined => eigenPaginas().find((a) => a.slug === slug);

/** Waar /aanbod/<slug> heen moet als het item een eigen pagina elders heeft (bv. rijschool → /rijschool-software); anders undefined. */
export const aanbodDoorsturen = (slug: string): string | undefined => AANBOD.find((a) => a.slug === slug && a.pagina)?.pagina;

export const pijlerVan = (s: PijlerSleutel): Pijler => {
  const p = PIJLERS.find((x) => x.sleutel === s);
  if (!p) throw new Error(`Onbekende pijler ${s}`);
  return p;
};

export const aanbodPerPijler = (s: PijlerSleutel): AanbodItem[] => AANBOD.filter((a) => a.pijler === s);

export const prijsTekst = (a: AanbodItem): string => a.prijs ?? "Op aanvraag";
