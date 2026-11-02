// ---------------------------------------------------------------------------
// Ontwerpvoorstel voor Het Schwarzwald (Rijssen): een nieuwe website gebouwd op
// ZekerFlex in plaats van WordPress. Hier staan de lijsten (activiteiten,
// feesten, doelgroepen, menu) voor kaarten en navigatie. De volledige teksten
// van hun pagina's staan letterlijk in schwarzwald-paginas.json, gekoppeld via
// `bron` (hun oorspronkelijke pad).
//
// Alles komt van hetschwarzwald.nl (opgehaald 2 nov 2026). Alleen de korte
// kaartteksten en feitenlijstjes hieronder zijn nieuw geschreven. De foto's in
// /public/voorstel/schwarzwald/ zijn van hun eigen site en alleen voor dit
// voorstel bedoeld (pagina's staan op noindex).
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
  kvk: "51448041",
  btw: "NL823223735 B01",
} as const;

export const OPENINGSTIJDEN = [
  { dagen: "Woensdag t/m vrijdag", tijd: "13:00 – 22:30" },
  { dagen: "Zaterdag en zondag", tijd: "11:00 – 22:30" },
] as const;

export const SOCIAAL = [
  { naam: "Facebook", href: "https://nl-nl.facebook.com/Hetschwarzwald" },
  { naam: "Instagram", href: "https://instagram.com/explore/locations/302260007/" },
  { naam: "Twitter", href: "https://twitter.com/hetschwarzwald" },
] as const;

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
  /** hun pad, sleutel in schwarzwald-paginas.json */
  bron: string;
  naam: string;
  /** één regel op de kaart */
  kort: string;
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
    bron: "/activiteiten/buggy-rijden",
    naam: "Buggy rijden",
    kort: "150cc crossbuggy's door zand en bos",
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
    bron: "/activiteiten/quad-rijden",
    naam: "Quad rijden",
    kort: "Onze meest geboekte activiteit, op een echte crossbaan",
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
    bron: "/activiteiten/4x4-off-road-tour",
    naam: "4×4 off-road tour",
    kort: "Modder, hellingen en een stoere terreinwagen",
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
    bron: "/activiteiten/e-chopper-tour",
    naam: "E-chopper tour",
    kort: "Geluidloos toeren door bos en heide",
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
    bron: "/activiteiten/solex-rijden",
    naam: "Solex rijden",
    kort: "In leren jas langs Markelo, Holten en Diepenheim",
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
    bron: "/activiteiten/retro-scooter-tour",
    naam: "Retro scooter tour",
    kort: "Vespa-gevoel in de Twentse natuur",
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
    bron: "/activiteiten/kever-rally",
    naam: "Kever rally",
    kort: "Puzzeltocht in een échte Volkswagen Kever",
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
    bron: "/activiteiten/swing-trike",
    naam: "Swing Trike",
    kort: "Elektrische driewieler die je stuurt met je lijf",
    categorie: "wielen",
    prijs: "€ 35 p.p.",
    duur: "1 uur",
    groep: "vanaf 8 personen",
    feiten: ["Elektrisch, maximaal 25 km/u", "Makkelijk te leren", "Route door het bos"],
    voor: ["bedrijfsuitje", "familiefeest"],
  },
  {
    slug: "segway-clinic",
    bron: "/activiteiten/segway-clinic",
    naam: "Segway clinic",
    kort: "Leunen is rijden, terugleunen is remmen",
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
    bron: "/activiteiten/anti-slipcursus",
    naam: "Anti-slipcursus",
    kort: "Theorie en praktijk in onze eigen slipauto's",
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
    bron: "/activiteiten/shooting-games",
    naam: "Shooting games",
    kort: "Handboog en luchtbuks: wie is de scherpschutter?",
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
    bron: "/activiteiten/escaperoom",
    naam: "Escaperoom",
    kort: "Zes rooms, vijftig spelers tegelijk",
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
    bron: "/activiteiten/sim-race-f1-playseat",
    naam: "F1 sim race",
    kort: "Echte F1-playseats, racen tegen elkaar",
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
  /** hun pad, sleutel in schwarzwald-paginas.json */
  bron: string;
  naam: string;
  kort: string;
  tekst: string;
  foto?: string;
  prijs?: string;
}

export const THEMAFEESTEN: Themafeest[] = [
  {
    slug: "tiroler-apres-ski",
    bron: "/themafeest/tiroler-apres-skihut",
    naam: "Tiroler après-skihut",
    kort: "De absolute topper",
    tekst: "DJ en presentator nemen de zaal mee in broekhangen, boomstamzagen, de Tiroler quiz, skilopen en jodelen. Niets is te gek.",
    foto: `${FOTO}/tirol.webp`,
  },
  {
    slug: "pubquiz",
    bron: "/themafeest/interactieve-pubquiz-feestquiz",
    naam: "Interactieve pubquiz",
    kort: "Meer dan 1500 groepen gingen je voor",
    tekst: "Een feestquiz met DJ-entertainer, gekke hoeden en teams die allemaal willen winnen. De perfecte afsluiter van een bedrijfsfeest.",
    foto: `${FOTO}/feest.webp`,
  },
  {
    slug: "ik-hou-van-holland",
    bron: "/themafeest/ik-hou-van-holland",
    naam: "Ik hou van Holland",
    kort: "Lachen, zingen, dansen",
    tekst: "Pruiken, gekke brillen en oranje boa's, en dan een interactieve spelshow met DJ en entertainer. Oer-Hollandse gezelligheid.",
  },
  {
    slug: "vikingfeest",
    bron: "/themafeest/vikingfeest",
    naam: "Vikingfeest",
    kort: "Trainingskamp voor stoere zeelieden",
    tekst: "Een Viking-trainingskamp in onze feestzaal, waar je gasten tot het uiterste gaan. Feesten zoals alleen Vikingen dat kunnen.",
  },
  {
    slug: "ziekenhuis-op-stelten",
    bron: "/themafeest/ziekenhuis-op-stelten",
    naam: "Ziekenhuis op stelten",
    kort: "Doldwaze doktoren en verpleegsters",
    tekst: "Schort aan en leer het vak van een stel doldwaze doktoren. Begint met een kruidenbittertje, en wie het nodig heeft neemt er nog één.",
  },
  {
    slug: "halloween-gps-speurtocht",
    bron: "/themafeest/halloween-gps-speurtocht",
    naam: "Halloween GPS-speurtocht",
    kort: "Vind de geheime uitgang van het bos",
    tekst: "Een interactieve GPS-game met app, inclusief soep, een drankje en snoep. Er is ook een 18+-editie met acteurs. Haal jij de Wall of Fame?",
    prijs: "€ 19,50 p.p.",
  },
];

export interface Doelgroep {
  slug: DoelgroepSlug;
  /** hun pagina voor deze doelgroep; zonder bron krijgt hij een eigen /voor-pagina */
  bron?: string;
  naam: string;
  /** korte titel voor tegels */
  tegel: string;
  kop: string;
  /** alleen nodig voor een eigen /voor-pagina */
  intro?: string;
  foto: string;
  punten: string[];
  /** toon de themafeesten op deze pagina */
  themas?: boolean;
  nieuw?: boolean;
}

export const DOELGROEPEN: Doelgroep[] = [
  {
    slug: "bedrijfsuitje",
    bron: "/bedrijfsfeest",
    naam: "Bedrijfsfeest & teamuitje",
    tegel: "Bedrijfsuitje",
    kop: "Het bedrijfsfeest waar maandag nog over gepraat wordt",
    foto: `${FOTO}/groep.webp`,
    punten: ["Groepen tot 400 personen, ruimte voor 500", "Vijf moderne zalen, ook om te vergaderen", "Vergaderen vanaf € 37,50 p.p. all-in", "Geen tussenpersoon, één duidelijke offerte"],
    themas: true,
  },
  {
    slug: "vrijgezellenfeest",
    bron: "/vrijgezellenfeest-arrangementen",
    naam: "Vrijgezellenfeest",
    tegel: "Vrijgezellen",
    kop: "Eén dag knallen voordat het serieus wordt",
    foto: `${FOTO}/segway-groep.webp`,
    punten: ["Vanaf 8 personen", "All-in met BBQ of buffet vanaf € 65 p.p.", "Buggy, quad, e-chopper en zes escaperooms", "Combineer gerust twee activiteiten"],
    themas: true,
  },
  {
    slug: "familiefeest",
    bron: "/familiefeest",
    naam: "Familiefeest",
    tegel: "Familie",
    kop: "Opa op de Solex, de neven in de escaperoom",
    foto: `${FOTO}/e-chopper.webp`,
    punten: ["All-in arrangementen vanaf € 55 p.p.", "Activiteiten voor jong en oud", "Eten en drinken op dezelfde plek", "Gratis parkeren"],
  },
  {
    slug: "kinderfeestje",
    naam: "Kinderfeestje",
    tegel: "Kinderfeestje",
    kop: "Een kinderfeestje met een echt crossbaan-gevoel",
    intro:
      "Op onze crossbaan staan elektrische kinderquads klaar, met helm en crossjas erbij. En straks komt daar ons nieuwe indoor entertainmentcenter bij: feest bij elk weer.",
    foto: `${FOTO}/quad.webp`,
    punten: ["Elektrische kinderquads", "Helm en crossjas inbegrepen", "Te combineren met eten en drinken", "Binnenkort ook indoor"],
    nieuw: true,
  },
  {
    slug: "trouwen",
    bron: "/trouw-arrangement",
    naam: "Trouwen",
    tegel: "Trouwen",
    kop: "Ja zeggen in het bos",
    foto: `${FOTO}/bruiloft.webp`,
    punten: ["Officiële trouwlocatie", "Ceremonie, receptie, diner en avondfeest", "Muzikale invulling op maat", "Eigen ceremoniemeester"],
  },
  {
    slug: "restaurant",
    bron: "/restaurant",
    naam: "Restaurant & horeca",
    tegel: "Eten & drinken",
    kop: "Na het avontuur: aan tafel",
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

/** Waar een doelgroep naartoe linkt: hun pagina, of anders onze eigen /voor-pagina. */
export function doelgroepHref(d: Doelgroep): string {
  return d.bron ? `${BASE}${d.bron}` : `${BASE}/voor/${d.slug}`;
}

export interface MenuItem {
  label: string;
  href: string;
  nieuw?: boolean;
}

export interface MenuGroep {
  label: string;
  /** overzichtspagina van de groep, als die er is */
  href?: string;
  items: MenuItem[];
}

// Hetzelfde menu als op hetschwarzwald.nl, plus het nieuwe kinderfeestje.
export const MENU: MenuGroep[] = [
  {
    label: "Ik zoek een…",
    items: [
      { label: "Bedrijfsfeest", href: `${BASE}/bedrijfsfeest` },
      { label: "Jubileumfeest", href: `${BASE}/jubileumfeest` },
      { label: "Personeelsfeest", href: `${BASE}/personeelsfeest` },
      { label: "Vrijgezellenfeest", href: `${BASE}/vrijgezellenfeest-arrangementen` },
      { label: "Familiefeest", href: `${BASE}/familiefeest` },
      { label: "Kinderfeestje", href: `${BASE}/voor/kinderfeestje`, nieuw: true },
      { label: "Vergaderlocatie", href: `${BASE}/zakelijk` },
    ],
  },
  {
    label: "Activiteiten",
    href: `${BASE}/activiteiten`,
    items: ACTIVITEITEN.map((a) => ({ label: a.naam, href: `${BASE}/activiteiten/${a.slug}` })),
  },
  {
    label: "Themafeesten",
    href: `${BASE}/themafeesten`,
    items: THEMAFEESTEN.map((t) => ({ label: t.naam, href: `${BASE}${t.bron}` })),
  },
  {
    label: "Vergaderen",
    href: `${BASE}/zakelijk`,
    items: [
      { label: "Vergaderarrangementen", href: `${BASE}/zakelijk` },
      { label: "Teambuilding & events", href: `${BASE}/zakelijk/teambuilding-events` },
      { label: "Eten & drinken", href: `${BASE}/zakelijk/eten-en-drinken` },
    ],
  },
  {
    label: "Trouwen",
    href: `${BASE}/trouw-arrangement`,
    items: [
      { label: "Trouwarrangement", href: `${BASE}/trouw-arrangement` },
      { label: "Huwelijksvoltrekking", href: `${BASE}/huwelijksvoltrekking` },
      { label: "Muzikale invulling", href: `${BASE}/muzikale-invulling` },
      { label: "Familiediner", href: `${BASE}/familiediner` },
      { label: "Avondfeest", href: `${BASE}/avondfeest` },
    ],
  },
  {
    label: "Restaurant",
    href: `${BASE}/restaurant`,
    items: [
      { label: "Restaurant", href: `${BASE}/restaurant` },
      { label: "Koffietafel", href: `${BASE}/restaurant/koffietafel` },
      { label: "Warm en koud buffet", href: `${BASE}/restaurant/warm-en-koud-buffet` },
      { label: "Hittesteen", href: `${BASE}/restaurant/hittesteen` },
      { label: "À la carte", href: `${BASE}/restaurant/a-la-carte` },
      { label: "BBQ", href: `${BASE}/restaurant/bbq` },
      { label: "Kookworkshops", href: `${BASE}/restaurant/workshops` },
    ],
  },
];

export const TOPLINKS: MenuItem[] = [
  { label: "Vacatures", href: `${BASE}/vacatures` },
  { label: "Openingstijden", href: `${BASE}/openingstijden` },
  { label: "Nieuws", href: `${BASE}/nieuws` },
  { label: "Contact", href: `${BASE}/contact` },
];
