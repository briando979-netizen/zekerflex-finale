// ---------------------------------------------------------------------------
// Ontwerpvoorstel voor Het Schwarzwald (Rijssen): een nieuwe website gebouwd op
// ZekerFlex in plaats van WordPress. Alle inhoud staat hier, de pagina's onder
// app/voorstel/schwarzwald/ renderen alleen deze lijsten. Een activiteit,
// feest of doelgroep toevoegen = één entry hieronder.
//
// Feiten en prijzen komen van hetschwarzwald.nl (opgehaald 2 nov 2026), de
// teksten zijn nieuw geschreven. Prijzen zijn hun gepubliceerde actieprijzen en
// kunnen veranderen. De foto's in /public/voorstel/schwarzwald/ zijn van hun
// eigen site en alleen voor dit voorstel bedoeld (pagina's staan op noindex).
// ---------------------------------------------------------------------------

export const BASE = "/voorstel/schwarzwald";
const FOTO = "/voorstel/schwarzwald";

export const CONTACT = {
  naam: "Het Schwarzwald",
  adres: "Markeloseweg 115",
  postcode: "7461 PB Rijssen",
  telefoon: "0548 51 85 05",
  telefoonHref: "tel:+31548518505",
  email: "info@hetschwarzwald.nl",
  /** Hun bestaande externe reserveringssysteem. */
  reserveerUrl: "https://schwarzwald.stackbase.nl/",
  score: "9,5",
  aantalReviews: 337,
} as const;

export type Categorie = "wielen" | "spel" | "skills";

export const CATEGORIE_LABEL: Record<Categorie, string> = {
  wielen: "Op wielen",
  spel: "Spel & spanning",
  skills: "Leer iets stoers",
};

export type DoelgroepSlug = "bedrijfsuitje" | "vrijgezellenfeest" | "familiefeest" | "kinderfeestje" | "trouwen" | "restaurant";

export interface Arrangement {
  /** programma-onderdelen in volgorde, bv. "Buggy tour (1 uur)" */
  stappen: string[];
  prijs: string;
}

export interface Activiteit {
  slug: string;
  naam: string;
  /** één regel op de kaart */
  kort: string;
  intro: string;
  foto?: string;
  categorie: Categorie;
  /** speelt zich binnen af, dus regenproof */
  binnen?: boolean;
  prijs: string;
  duur: string;
  groep: string;
  feiten: string[];
  arrangement?: Arrangement;
  voor: DoelgroepSlug[];
}

const BBQ = "BBQ met onbeperkt bier, fris en wijn (2,5 uur)";
const ONTVANGST = "Ontvangst met koffie, thee en cake (30 min)";

export const ACTIVITEITEN: Activiteit[] = [
  {
    slug: "buggy-rijden",
    naam: "Buggy rijden",
    kort: "150cc crossbuggy's door zand en bos",
    intro:
      "Met z'n tweeën in een robuuste crossbuggy, achter de instructeur aan door zand, bospaden en over verharde wegen. Halverwege wissel je van stuur. Stof in je haren, grijns op je gezicht.",
    foto: `${FOTO}/buggy.webp`,
    categorie: "wielen",
    prijs: "€ 65 p.p.",
    duur: "1 uur",
    groep: "vanaf 8 personen",
    feiten: [
      "30 tweepersoons buggy's met profielbanden, tot 55 km/u",
      "Instructeur en veiligheidsuitleg vooraf",
      "Stofbrillen in bruikleen",
      "Zondag actietarief: € 60 p.p.",
    ],
    arrangement: { stappen: [ONTVANGST, "Buggy tour (1 uur)", BBQ], prijs: "€ 100 p.p. (vanaf 8 personen)" },
    voor: ["bedrijfsuitje", "vrijgezellenfeest", "familiefeest"],
  },
  {
    slug: "quad-rijden",
    naam: "Quad rijden",
    kort: "Onze meest geboekte activiteit, op een echte crossbaan",
    intro:
      "Heuvels, springbulten en scherpe bochten op een echte motorcrossbaan. De 250cc-automaatquads rijden makkelijk, dus met een klein beetje lef kan iedereen mee. Voor kinderen staan elektrische kinderquads klaar.",
    foto: `${FOTO}/quad.webp`,
    categorie: "wielen",
    prijs: "vanaf € 60 p.p.",
    duur: "2 heats van 12 minuten",
    groep: "4 tot 400 personen",
    feiten: ["250cc-automaatquads", "Elektrische kinderquads", "Helm, haarnetje en crossjas inbegrepen"],
    voor: ["bedrijfsuitje", "vrijgezellenfeest", "familiefeest", "kinderfeestje"],
  },
  {
    slug: "4x4-off-road",
    naam: "4×4 off-road tour",
    kort: "Modder, hellingen en een stoere terreinwagen",
    intro:
      "Een instructeur leert je hoe je een 4×4 over modder en steile hellingen stuurt. Het gaat om techniek en beheersing, en dat blijkt lastiger (en leuker) dan je denkt.",
    foto: `${FOTO}/offroad.webp`,
    categorie: "wielen",
    prijs: "vanaf € 60 p.p.",
    duur: "1 uur, in roulatie",
    groep: "vanaf 10 personen",
    feiten: ["Voor iedereen met een geldig autorijbewijs", "Uitleg door een instructeur","Te combineren met buggy, kever, solex of escaperoom"],
    voor: ["bedrijfsuitje", "vrijgezellenfeest"],
  },
  {
    slug: "e-chopper-tour",
    naam: "E-chopper tour",
    kort: "Geluidloos toeren door bos en heide",
    intro:
      "Stoere elektrische choppers, een volle accu en een route langs de Sallandse Heuvelrug. De route werkt met fotoherkenning, dus verdwalen kan niet. Stop onderweg gerust bij een terras.",
    foto: `${FOTO}/e-chopper.webp`,
    categorie: "wielen",
    prijs: "vanaf € 35 p.p.",
    duur: "1, 2 of 3 uur",
    groep: "vanaf 8 personen",
    feiten: ["1 uur € 35 · 2 uur € 45 · 3 uur € 55 p.p.", "Helm gratis te leen", "Bromfietsrijbewijs nodig", "Inclusief verzekering, geen borg"],
    arrangement: { stappen: [ONTVANGST, "E-chopper tour (1 uur)", BBQ], prijs: "€ 75 p.p. (vanaf 8 personen)" },
    voor: ["bedrijfsuitje", "vrijgezellenfeest", "familiefeest"],
  },
  {
    slug: "solex-rijden",
    naam: "Solex rijden",
    kort: "In leren jas langs Markelo, Holten en Diepenheim",
    intro:
      "Hijs je in de ouderwetse leren outfit, start de Solex en tuf langs de mooiste plekjes van Overijssel. Langzaam, luidruchtig en gegarandeerd hilarisch.",
    foto: `${FOTO}/solex.webp`,
    categorie: "wielen",
    prijs: "vanaf € 35 p.p.",
    duur: "1, 2 of 3 uur",
    groep: "vanaf 8 personen",
    feiten: ["1 uur € 35 · 2 uur € 45 · 3 uur € 55 p.p.", "Inclusief verzekering en volle tank", "Leren kleding uit de kast"],
    voor: ["bedrijfsuitje", "vrijgezellenfeest", "familiefeest"],
  },
  {
    slug: "retro-scooter-tour",
    naam: "Retro scooter tour",
    kort: "Vespa-gevoel in de Twentse natuur",
    intro:
      "Een retro scooter, een unieke route en de frisse lucht van de Schwarzwalder bossen. Wedden dat je na afloop helemaal ontspannen bent?",
    foto: `${FOTO}/scooter.webp`,
    categorie: "wielen",
    prijs: "vanaf € 35 p.p.",
    duur: "1, 2 of 3 uur",
    groep: "vanaf 8 personen",
    feiten: ["1 uur € 35 · 2 uur € 45 · 3 uur € 55 p.p.", "Inclusief verzekering en volle tank", "Duidelijke route en uitleg vooraf"],
    voor: ["bedrijfsuitje", "vrijgezellenfeest", "familiefeest"],
  },
  {
    slug: "kever-rally",
    naam: "Kever rally",
    kort: "Puzzeltocht in een échte Volkswagen Kever",
    intro:
      "Terug naar de jaren zestig: stap in een klassieke Kever en los onderweg de puzzels op. Geen ellenlange briefing, gewoon instappen en genieten van de bosrijke route.",
    foto: `${FOTO}/kever.webp`,
    categorie: "wielen",
    prijs: "€ 35 p.p.",
    duur: "1,5 uur",
    groep: "vanaf 8 personen",
    feiten: ["Puzzeltocht door het bos","Verzekering € 15 per Kever", "Zaterdag en feestdagen + € 10 p.p."],
    voor: ["bedrijfsuitje", "vrijgezellenfeest", "familiefeest"],
  },
  {
    slug: "swing-trike",
    naam: "Swing Trike",
    kort: "Elektrische driewieler die je stuurt met je lijf",
    intro:
      "De Swing Trike stuur je net als een Segway met je lichaam. Hij gaat niet harder dan 25 km/u, dus je kunt onderweg gewoon met elkaar kletsen tussen de bomen.",
    categorie: "wielen",
    prijs: "€ 35 p.p.",
    duur: "1 uur",
    groep: "vanaf 8 personen",
    feiten: ["Elektrisch, maximaal 25 km/u", "Makkelijk te leren", "Route door het bos"],
    voor: ["bedrijfsuitje", "familiefeest"],
  },
  {
    slug: "segway-clinic",
    naam: "Segway clinic",
    kort: "Leunen is rijden, terugleunen is remmen",
    intro:
      "Eerst wennen, dan los op de uitdagende Segway-baan in het bos. Je stuurt met je eigen lichaamsgewicht en hebt het sneller onder de knie dan je denkt.",
    foto: `${FOTO}/segway.webp`,
    categorie: "skills",
    prijs: "€ 25 p.p.",
    duur: "1 uur",
    groep: "vanaf 8 personen",
    feiten: ["Uitdagende Segway-baan", "Intuïtieve besturing", "Optioneel met BBQ"],
    voor: ["bedrijfsuitje", "familiefeest"],
  },
  {
    slug: "anti-slipcursus",
    naam: "Anti-slipcursus",
    kort: "Theorie en praktijk in onze eigen slipauto's",
    intro:
      "Twee uur lang leren wat je auto doet als het glad wordt, en hoe je hem weer onder controle krijgt. Leerzaam, spannend en net zo leuk als een kermisattractie.",
    foto: `${FOTO}/slipcursus.webp`,
    categorie: "skills",
    prijs: "€ 75 p.p. (normaal € 100)",
    duur: "2 uur",
    groep: "vanaf 18 jaar, met autorijbewijs",
    feiten: ["Eigen slipauto's", "Theorie en praktijk", "Locatie: Ommerweg 150, Hellendoorn"],
    voor: ["bedrijfsuitje"],
  },
  {
    slug: "shooting-games",
    naam: "Shooting games",
    kort: "Handboog en luchtbuks: wie is de scherpschutter?",
    intro:
      "Handboogschieten en luchtbuksschieten midden in het Schwarzwalder bos, met instructeurs die je de kneepjes leren. Een uurtje dolle pret, zeker als je tegen collega's of vrienden strijdt.",
    foto: `${FOTO}/shooting.webp`,
    categorie: "spel",
    prijs: "prijs op aanvraag",
    duur: "1 uur",
    groep: "groepen",
    feiten: ["Handboog- en luchtbuksschieten", "Ervaren instructeurs", "Optioneel met BBQ of buffet"],
    voor: ["bedrijfsuitje", "vrijgezellenfeest", "familiefeest"],
  },
  {
    slug: "escaperoom",
    naam: "Escaperoom",
    kort: "Zes rooms, vijftig spelers tegelijk",
    intro:
      "Wild West, de Tweede Wereldoorlog of de maffia: kies je thema en ontsnap binnen het uur. Met zes rooms spelen tot vijftig mensen tegelijk, uniek in Nederland. Win jij de battle in een van de vier identieke kamers?",
    foto: `${FOTO}/escaperoom.webp`,
    categorie: "spel",
    binnen: true,
    prijs: "vanaf € 125 per room",
    duur: "60 minuten",
    groep: "2 tot 10 per room, tot 50 tegelijk",
    feiten: ["Thema's: Wild West, WOII en Maffia", "Vanaf 12 jaar", "Verschillende moeilijkheidsniveaus"],
    arrangement: { stappen: [ONTVANGST, "Escaperoom (1 uur)", BBQ], prijs: "€ 75 p.p. (vanaf 8 personen)" },
    voor: ["bedrijfsuitje", "vrijgezellenfeest", "familiefeest"],
  },
  {
    slug: "f1-sim-race",
    naam: "F1 sim race",
    kort: "Echte F1-playseats, racen tegen elkaar",
    intro:
      "Kruip in een F1-playseat en race over de officiële Grand Prix-circuits. De simulators zijn aan elkaar te koppelen, dus je racet echt tegen je collega's. Ook te huur op je eigen locatie.",
    categorie: "spel",
    binnen: true,
    prijs: "vanaf € 200 per stoel",
    duur: "1 uur",
    groep: "10 stoelen beschikbaar",
    feiten: ["Complete set: playseat, computer en 43-inch scherm", "Multiplayer: racen tegen elkaar", "Ook bij jou op locatie (tot 75 km)"],
    arrangement: {
      stappen: [ONTVANGST, "F1 sim racing (1 uur)", "Bourgondische hittesteen met onbeperkt bier, fris en wijn (2,5 uur)"],
      prijs: "€ 75 p.p. (vanaf 12 personen)",
    },
    voor: ["bedrijfsuitje", "vrijgezellenfeest", "familiefeest"],
  },
];

export interface Themafeest {
  slug: string;
  naam: string;
  kort: string;
  tekst: string;
  foto?: string;
  prijs?: string;
}

export const THEMAFEESTEN: Themafeest[] = [
  {
    slug: "tiroler-apres-ski",
    naam: "Tiroler après-skihut",
    kort: "De absolute topper",
    tekst: "DJ en presentator nemen de zaal mee in broekhangen, boomstamzagen, de Tiroler quiz, skilopen en jodelen. Niets is te gek.",
    foto: `${FOTO}/tirol.webp`,
  },
  {
    slug: "pubquiz",
    naam: "Interactieve pubquiz",
    kort: "Meer dan 1500 groepen gingen je voor",
    tekst: "Een feestquiz met DJ-entertainer, gekke hoeden en teams die allemaal willen winnen. De perfecte afsluiter van een bedrijfsfeest.",
    foto: `${FOTO}/feest.webp`,
  },
  {
    slug: "ik-hou-van-holland",
    naam: "Ik hou van Holland",
    kort: "Lachen, zingen, dansen",
    tekst: "Pruiken, gekke brillen en oranje boa's, en dan een interactieve spelshow met DJ en entertainer. Oer-Hollandse gezelligheid.",
  },
  {
    slug: "vikingfeest",
    naam: "Vikingfeest",
    kort: "Trainingskamp voor stoere zeelieden",
    tekst: "Een Viking-trainingskamp in onze feestzaal, waar je gasten tot het uiterste gaan. Feesten zoals alleen Vikingen dat kunnen.",
  },
  {
    slug: "ziekenhuis-op-stelten",
    naam: "Ziekenhuis op stelten",
    kort: "Doldwaze doktoren en verpleegsters",
    tekst: "Schort aan en leer het vak van een stel doldwaze doktoren. Begint met een kruidenbittertje, en wie het nodig heeft neemt er nog één.",
  },
  {
    slug: "halloween-gps-speurtocht",
    naam: "Halloween GPS-speurtocht",
    kort: "Vind de geheime uitgang van het bos",
    tekst: "Een interactieve GPS-game met app, inclusief soep, een drankje en snoep. Er is ook een 18+-editie met acteurs. Haal jij de Wall of Fame?",
    prijs: "€ 19,50 p.p.",
  },
];

export interface Doelgroep {
  slug: DoelgroepSlug;
  naam: string;
  /** korte titel voor tegels */
  tegel: string;
  kop: string;
  intro: string;
  foto: string;
  punten: string[];
  /** toon de themafeesten op deze pagina */
  themas?: boolean;
  nieuw?: boolean;
}

export const DOELGROEPEN: Doelgroep[] = [
  {
    slug: "bedrijfsuitje",
    naam: "Bedrijfsfeest & teamuitje",
    tegel: "Bedrijfsuitje",
    kop: "Het bedrijfsfeest waar maandag nog over gepraat wordt",
    intro:
      "Van teamuitje met acht collega's tot personeelsfeest met honderden mensen: wij regelen activiteit, eten, drinken en feest op één bosrijke locatie direct aan de A1. Ook voor jubilea en vergaderingen.",
    foto: `${FOTO}/groep.webp`,
    punten: ["Groepen tot 400 personen, ruimte voor 500", "Vijf moderne zalen, ook om te vergaderen", "Vergaderen vanaf € 37,50 p.p. all-in", "Geen tussenpersoon, één duidelijke offerte"],
    themas: true,
  },
  {
    slug: "vrijgezellenfeest",
    naam: "Vrijgezellenfeest",
    tegel: "Vrijgezellen",
    kop: "Eén dag knallen voordat het serieus wordt",
    intro:
      "Kies een stoere activiteit, sluit af met een BBQ en jullie vrijgezellenfeest is meteen geregeld. Van budget tot deluxe, en niemand hoeft ergens achteraan.",
    foto: `${FOTO}/segway-groep.webp`,
    punten: ["Vanaf 8 personen", "All-in met BBQ of buffet vanaf € 65 p.p.", "Buggy, quad, e-chopper en zes escaperooms", "Combineer gerust twee activiteiten"],
    themas: true,
  },
  {
    slug: "familiefeest",
    naam: "Familiefeest",
    tegel: "Familie",
    kop: "Opa op de Solex, de neven in de escaperoom",
    intro:
      "Familiefeesten draaien om samen lachen. Midden in het bos tussen Rijssen, Holten en Markelo combineer je een activiteit met heerlijk eten, zodat jong en oud een dag hebben om nooit te vergeten.",
    foto: `${FOTO}/e-chopper.webp`,
    punten: ["All-in arrangementen vanaf € 55 p.p.", "Activiteiten voor jong en oud", "Eten en drinken op dezelfde plek", "Gratis parkeren"],
  },
  {
    slug: "kinderfeestje",
    naam: "Kinderfeestje",
    tegel: "Kinderfeestje",
    kop: "Een kinderfeestje met een echt crossbaan-gevoel",
    intro:
      "Op onze crossbaan staan elektrische kinderquads klaar, met helm en uitleg erbij. En straks komt daar ons nieuwe indoor entertainmentcenter bij: feest bij elk weer.",
    foto: `${FOTO}/quad.webp`,
    punten: ["Elektrische kinderquads", "Helm en crossjas inbegrepen", "Te combineren met eten en drinken", "Binnenkort ook indoor"],
    nieuw: true,
  },
  {
    slug: "trouwen",
    naam: "Trouwen",
    tegel: "Trouwen",
    kop: "Ja zeggen in het bos",
    intro:
      "Als officiële trouwlocatie verzorgen we jullie hele dag: de ceremonie, de receptie, een familiediner en een avondfeest waarvoor de zaal een complete metamorfose krijgt. Met persoonlijke aandacht en een dagplanning op maat.",
    foto: `${FOTO}/bruiloft.webp`,
    punten: ["Officiële trouwlocatie", "Ceremonie, receptie, diner en avondfeest", "Muzikale invulling op maat", "Eigen ceremoniemeester"],
  },
  {
    slug: "restaurant",
    naam: "Restaurant & horeca",
    tegel: "Eten & drinken",
    kop: "Na het avontuur: aan tafel",
    intro:
      "Of je nu komt voor een feest of gewoon lekker wilt eten: ons restaurant serveert van koffietafel tot bourgondische hittesteen. Bij de arrangementen hoort onbeperkt bier, fris en wijn.",
    foto: `${FOTO}/restaurant.webp`,
    punten: ["Koffietafel en lunch", "Warm en koud buffet", "Bourgondische hittesteen en BBQ", "À la carte en kookworkshops"],
  },
];

export interface Review {
  tekst: string;
  naam: string;
  bij: string;
}

export const REVIEWS: Review[] = [
  {
    tekst: "Super locatie, super organisatie. Iedereen heeft het perfect naar zijn zin gehad. Absoluut een aanrader en ook goed concurrerend qua prijs.",
    naam: "Bonhof Wilp",
    bij: "Personeelsuitje, 50 + 90 personen",
  },
  {
    tekst: "We werden ontvangen met koffie en cake, daarna hadden we een antislipcursus: een geweldige ervaring! Aansluitend hebben we gegeten en de avond afgesloten met een pubquiz.",
    naam: "Anita",
    bij: "Bedrijfsfeest, Pluimers Kraanverhuur",
  },
  {
    tekst: "We hebben een ontzettend leuke en goed verzorgde dag gehad, waarbij het aan niets ontbrak!",
    naam: "Giel en Daniëlle",
    bij: "Bruiloft",
  },
];

export function activiteit(slug: string): Activiteit | undefined {
  return ACTIVITEITEN.find((a) => a.slug === slug);
}

export function doelgroep(slug: string): Doelgroep | undefined {
  return DOELGROEPEN.find((d) => d.slug === slug);
}

export function activiteitenVoor(slug: DoelgroepSlug): Activiteit[] {
  return ACTIVITEITEN.filter((a) => a.voor.includes(slug));
}
