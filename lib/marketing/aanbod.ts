// Het complete aanbod van ZekerFlex op één plek. De homepage, het menu, de
// overzichtspagina /aanbod en de losse pagina's /aanbod/<slug> lezen allemaal
// uit deze lijst, zodat elk product (ook een nieuw) vanzelf overal een plek
// krijgt. Puur bestand: geen prisma/kv, dus ook bruikbaar in client-code.
//
// Prijzen staan hier alleen als ze echt vastliggen (de staffel komt uit
// lib/pricing/tiers.ts); anders "op aanvraag". Iets wat nog op een sleutel of
// keuze van de eigenaar wacht, staat op "binnenkort".

import type { Werkruimte } from "@/lib/werkgever/werkruimte";

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
  /** een tweede knop naar voorbeelden om eerst rond te kijken (bv. /voorbeeldsites) */
  voorbeelden?: { label: string; href: string };
  /** zoekwoorden voor de eigen pagina */
  zoekwoorden?: string[];
  /** foto in public/aanbod (bron en licentie in public/aanbod/CREDITS.md) */
  foto?: { bestand: string; alt: string };
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
/** Een product met een eigen dashboard: aanmelden opent meteen dat dashboard (lib/auth/aanmelden-dashboard.ts). */
const aanmeldenVoor = (soort: Exclude<Werkruimte, "personeel">) => ({ label: AANMELDEN.label, href: `/register?type=bedrijf&dashboard=${soort}` });
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
    foto: { bestand: "inchecken-op-locatie.jpg", alt: "Iemand checkt in op een tablet bij de ingang" },
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
    foto: { bestand: "certificaten-in-een-foto.jpg", alt: "Een telefoon maakt een foto van een document" },
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
    foto: { bestand: "spoedoproep.jpg", alt: "Een medewerker in een magazijn kijkt op zijn telefoon" },
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
  // Netwerkpakketten (lib/netwerk/modules.ts): op de eigen server, zonder licentiekosten bij een ander.
  // 5G blijft "binnenkort" (vergunning en apparatuur per terrein); wifi en VPN draaien op de eigen server.
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
    status: "beschikbaar",
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
    status: "beschikbaar",
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

  // Op locatie (lib/locatie/modules.ts): vier modules voor de werkvloer, op de eigen server en zonder licentiekosten.
  // Aanzetten kan direct onder Werkgever → Op locatie; de prijs is nog "op aanvraag" (geen verzonnen prijzen).
  {
    slug: "portofoon-in-de-app",
    pijler: "personeel",
    naam: "Portofoon in de app",
    kort: "Druk, praat, los: je team op locatie hoort je direct, zonder losse portofoons.",
    tekst:
      "Een flexwerker op een evenement, bouwplaats of in een distributiecentrum houdt de knop ingedrukt en praat; iedereen in hetzelfde kanaal hoort het meteen. Elke klus en elke vestiging heeft een eigen kanaal, en wie ingepland staat zit er vanzelf in. Is iemand even niet verbonden, dan laat je een spraakbericht achter dat vanzelf afspeelt.",
    punten: [
      "Een kanaal per klus en per vestiging; wie ingepland staat, zit er vanzelf in",
      "Houd de knop ingedrukt en praat; je ziet wie er luistert en wie er praat",
      "Versleuteld, rechtstreeks tussen de telefoons, via onze eigen servers",
      "Geen bereik? Spreek een bericht in; het speelt bij de ander vanzelf af",
      "Op elke telefoon, in de browser of de ZekerFlex-app; geen portofoons huren",
    ],
    voorWie: "Evenementen, beveiliging, bouw, logistiek en magazijnen met teams die elkaar snel moeten bereiken",
    status: "beschikbaar",
    start: { label: "Aanzetten in je werkgeversomgeving", href: "/werkgever/op-locatie" },
    zoekwoorden: ["portofoon app", "push to talk app", "walkie talkie app bedrijf", "portofoon evenement personeel", "team communicatie bouwplaats"],
  },
  {
    slug: "toegang-op-kenteken",
    pijler: "personeel",
    naam: "Toegang op kenteken",
    kort: "Een camera leest het kenteken; staat de bestuurder vandaag ingepland, dan gaat de slagboom open.",
    tekst:
      "Bij de ingang van het terrein leest een gewone IP-camera het kenteken. ZekerFlex kijkt in het rooster: staat deze flexwerker, medewerker of leverancier nu bij jullie ingepland, dan geeft de slagboom of het hek vrij. Elke aankomst staat in het logboek, de planner krijgt een melding en de flexwerker is welkom zonder te bellen of aan te melden bij de portier.",
    punten: [
      "Flexwerkers vullen hun kenteken één keer in; jij hoeft niets over te typen",
      "Open alleen voor wie nu ingepland staat, of voor een bezoeker met een tijdvenster",
      "Logboek van elke aankomst met tijd, kenteken en naam; de planner krijgt een melding",
      "Handmatig openen vanuit je ZekerFlex-beheer, met één druk op de knop",
      "Werkt met een gewone IP-camera (RTSP) en een klein kastje bij de slagboom",
    ],
    voorWie: "Bouwplaatsen, distributiecentra, evenemententerreinen en bedrijfsterreinen met een slagboom of hek",
    status: "beschikbaar",
    start: { label: "Aanzetten in je werkgeversomgeving", href: "/werkgever/op-locatie" },
    zoekwoorden: ["kentekenherkenning slagboom", "kenteken toegang bouwplaats", "automatische toegang terrein personeel", "anpr slagboom", "kentekenherkenning parkeerplaats bedrijf"],
  },
  {
    slug: "sleutelkluis",
    pijler: "personeel",
    naam: "Sleutelkluis",
    kort: "Wifi-codes, alarmcodes en inloggegevens die een flexwerker alleen ziet zolang de dienst duurt.",
    tekst:
      "Je legt per vestiging vast wat een flexwerker op de werkvloer nodig heeft: het wifi-wachtwoord, de alarmcode, de code van het sleutelkastje of de inlog van de kassa. Wie ingepland staat, ziet dat vanaf twee uur voor de dienst tot het einde ervan; daarna is het weg. Je ziet wie wat bekeken heeft, en krijgt een seintje als een code na een dienst beter vervangen kan worden.",
    punten: [
      "Versleuteld opgeslagen op onze eigen server; nooit via chat, papier of een groepsapp",
      "Zichtbaar van twee uur vóór de dienst tot het einde; daarna automatisch ingetrokken",
      "Per vestiging of voor het hele bedrijf; je eigen team ziet alles, een flexwerker alleen zijn dienst",
      "Logboek: wie bekeek welke code wanneer",
      "Een seintje als een code na een dienst beter vervangen kan worden",
    ],
    voorWie: "Horeca, retail, schoonmaak, beveiliging en kantoren die flexwerkers toegang geven tot panden, kassa's en systemen",
    status: "beschikbaar",
    start: { label: "Aanzetten in je werkgeversomgeving", href: "/werkgever/op-locatie" },
    zoekwoorden: ["wachtwoorden delen met personeel", "alarmcode flexwerker", "sleutelbeheer personeel", "wifi wachtwoord personeel veilig", "toegangscodes tijdelijk delen"],
  },
  {
    slug: "badges-en-labels-printen",
    pijler: "personeel",
    naam: "Badges en labels printen",
    kort: "Checkt een flexwerker in, dan rolt zijn bezoekersbadge of naamsticker direct uit de printer.",
    tekst:
      "Zodra iemand incheckt op locatie maakt ZekerFlex een badge: naam, bedrijf, klus en een controlecode. Die gaat naar een goedkope thermische labelprinter op de werkvloer, via de computer of rechtstreeks via Bluetooth vanaf een telefoon. Ook naamstickers, verzendlabels en incheckbonnen print je zo, zonder printsoftware van een ander.",
    punten: [
      "Badge of naamsticker direct bij het inchecken, zonder dat iemand iets hoeft te doen",
      "Print vanaf elke computer (ook Linux of Mac) of via Bluetooth vanaf een telefoon",
      "Sjablonen voor bezoekersbadge, naamsticker, verzendlabel en incheckbon",
      "Werkt met de meeste thermische labelprinters (Brother QL, Dymo, Zebra, Bluetooth-bonprinters)",
      "Een printwachtrij per vestiging, met een logboek van wat geprint is",
    ],
    voorWie: "Evenementen, magazijnen, bouwplaatsen en kantoren waar bezoekers en flexwerkers herkenbaar moeten zijn",
    status: "beschikbaar",
    start: { label: "Aanzetten in je werkgeversomgeving", href: "/werkgever/op-locatie" },
    zoekwoorden: ["bezoekersbadge printen", "naamsticker printen bij inchecken", "labelprinter personeel", "badge printer evenement", "thermische labelprinter bedrijf"],
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
    voorbeelden: { label: "Bekijk voorbeeldwebsites", href: "/voorbeeldsites" },
    zoekwoorden: ["website laten bouwen", "website laten maken", "website voor mijn bedrijf", "websitebouwer", "website zonder cookies"],
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
    voorbeelden: { label: "Bekijk voorbeelden met webshop", href: "/voorbeeldsites" },
    zoekwoorden: ["webshop openen", "eigen webwinkel starten", "webshop beginnen", "webwinkel laten maken"],
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
    start: aanmeldenVoor("horeca"),
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
    start: aanmeldenVoor("rijschool"),
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
    foto: { bestand: "bedrijfscheck.jpg", alt: "Een ondernemer bekijkt papieren naast zijn laptop" },
  },
  {
    slug: "e-facturatie",
    pijler: "geld",
    naam: "E-facturatie (UBL / Peppol)",
    kort: "Elke factuur ook als e-factuur die je boekhoudpakket direct inleest, zonder overtypen.",
    tekst:
      "Elke factuur van ZekerFlex is ook een e-factuur volgens de Europese norm (UBL, Peppol BIS 3 / NLCIUS). Je boekhoudpakket leest hem direct in: geen overtypen, geen fouten. Download het bestand per factuur, laat het automatisch naar je pakket mailen of ontvang het via het Peppol-netwerk op het adres van je bedrijf.",
    punten: [
      "UBL-bestand bij elke factuur, volgens EN 16931 / Peppol BIS 3",
      "Automatisch naar het mailadres van je boekhoudpakket",
      "Bezorging via het Peppol-netwerk op je KVK- of btw-nummer",
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
