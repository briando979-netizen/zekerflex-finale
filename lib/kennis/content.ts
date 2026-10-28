// ---------------------------------------------------------------------------
// Kennisbank + blog content. Plain data — rendered by the /kennis pages in the
// same marketing style as the rest of the site. No DB, no CMS.
// ---------------------------------------------------------------------------

export interface Article {
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  readMinutes: number;
  updated: string; // ISO date
  /** section blocks: a heading + paragraphs */
  body: { heading: string; paragraphs: string[] }[];
}

export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  date: string; // ISO
  readMinutes: number;
  body: { heading?: string; paragraphs: string[] }[];
}

export const GUIDES: Article[] = [
  {
    slug: "wet-dba-uitgelegd",
    category: "Compliance",
    title: "De Wet DBA in gewone taal",
    excerpt:
      "Wat de Wet DBA betekent voor jou als zzp'er of opdrachtgever, en hoe ZekerFlex het risico op schijnzelfstandigheid automatisch bewaakt.",
    readMinutes: 6,
    updated: "2026-08-01",
    body: [
      {
        heading: "Waar gaat de Wet DBA over?",
        paragraphs: [
          "De Wet DBA (Deregulering Beoordeling Arbeidsrelaties) bepaalt wanneer iemand echt zelfstandig werkt en wanneer er eigenlijk sprake is van een verkapt dienstverband — schijnzelfstandigheid. Drie dingen wegen zwaar: is er een gezagsverhouding, moet je het werk persoonlijk doen, en hoe afhankelijk ben je van één opdrachtgever.",
          "Sinds 2025 handhaaft de Belastingdienst weer actief. Bij schijnzelfstandigheid kan de opdrachtgever loonheffingen en premies moeten nabetalen, met boetes.",
        ],
      },
      {
        heading: "Hoe ZekerFlex dit oplost",
        paragraphs: [
          "Bij een match zet ZekerFlex de afspraken voor de opdracht klaar en kunnen beide partijen die digitaal ondertekenen. De templates van ZekerFlex zijn niet als door de Belastingdienst goedgekeurde modelovereenkomsten geregistreerd.",
          "Daarnaast signaleert het platform factoren zoals opeenvolgende weken en omzetconcentratie en kan het bij verhoogd risico nieuwe matches beperken. Dit is geen garantie of juridisch oordeel: de Belastingdienst beoordeelt de arbeidsrelatie aan de hand van alle omstandigheden en de manier waarop er feitelijk wordt gewerkt.",
        ],
      },
      {
        heading: "Wat betekent dit in de praktijk?",
        paragraphs: [
          "Voor jou als kracht: je hoeft zelf geen overeenkomsten op te stellen en je krijgt een seintje als je te afhankelijk dreigt te worden van één klant.",
          "Voor opdrachtgevers: je ziet de risicosignalen per samenwerking in het compliance-overzicht, met een uitleg en een advies. Geen verrassingen achteraf.",
        ],
      },
    ],
  },
  {
    slug: "stipp-pensioen",
    category: "Uitzenden",
    title: "StiPP-pensioen als uitzendkracht",
    excerpt:
      "Wanneer je pensioen begint op te bouwen, het verschil tussen de basis- en plusregeling, en wat de werkgever bijdraagt.",
    readMinutes: 4,
    updated: "2026-07-15",
    body: [
      {
        heading: "Wanneer bouw je op?",
        paragraphs: [
          "Werk je via ZekerFlex als uitzendkracht, dan val je onder StiPP — het pensioenfonds voor de uitzendbranche. Vanaf de 9e gewerkte week start de basisregeling.",
          "Na 78 gewerkte weken ga je over naar de plusregeling. Daarin ligt de premie hoger en betaalt de werkgever een deel mee.",
        ],
      },
      {
        heading: "Basis versus plus",
        paragraphs: [
          "Basisregeling: je bouwt pensioen op over je brutoloon plus vakantiegeld. De premie wordt op je loon ingehouden.",
          "Plusregeling: hogere opbouw, met een indicatieve werkgeversbijdrage bovenop je loon. Die bijdrage wordt niet op jouw nettoloon ingehouden.",
          "Je actuele regeling, opgebouwde weken en de exacte bedragen staan elke week op je loonstrook in het dashboard onder Verloning.",
        ],
      },
    ],
  },
  {
    slug: "abu-fasensysteem",
    category: "Uitzenden",
    title: "Het ABU-fasensysteem, stap voor stap",
    excerpt:
      "Fase A, B en C bepalen hoeveel zekerheid je opbouwt als uitzendkracht. Zo werkt het bij ZekerFlex.",
    readMinutes: 5,
    updated: "2026-07-15",
    body: [
      {
        heading: "Fase A",
        paragraphs: [
          "De eerste 52 gewerkte weken. Er geldt een uitzendbeding: de opdracht kan tussentijds eindigen, en je wordt betaald voor de uren die je werkt.",
        ],
      },
      {
        heading: "Fase B",
        paragraphs: [
          "Week 53 tot en met 208 (maximaal 4 jaar). Je werkt op basis van tijdelijke contracten met meer bescherming: loondoorbetaling bij ziekte en een opzegtermijn.",
        ],
      },
      {
        heading: "Fase C",
        paragraphs: [
          "Na fase B krijg je een contract voor onbepaalde tijd bij het uitzendbureau. Maximale zekerheid, met behoud van de flexibiliteit in het soort werk dat je doet.",
          "ZekerFlex volgt de ABU-cao. Je fase en opgebouwde weken zijn altijd actueel zichtbaar in je dashboard; bij een aankomende contractwissel krijg je automatisch bericht.",
        ],
      },
    ],
  },
  {
    slug: "reistijd-en-matching",
    category: "Zo werkt het",
    title: "Hoe de matching je reistijd meeweegt",
    excerpt:
      "Waarom je alleen diensten ziet waar je een sterke match voor bent, en hoe reistijd per vervoerswijze wordt berekend.",
    readMinutes: 3,
    updated: "2026-06-20",
    body: [
      {
        heading: "De matchscore",
        paragraphs: [
          "Elke dienst krijgt een score op basis van je vak, je betrouwbaarheid, je beschikbaarheid en je reistijd vanaf je thuisbasis. Je ziet alleen aanbod waar je echt kans maakt — geen eindeloze lijst.",
        ],
      },
      {
        heading: "Reistijd per vervoerswijze",
        paragraphs: [
          "Op elke kluskaart zie je de reistijd met OV, auto, fiets en lopen, met de snelste optie gemarkeerd. De inschatting houdt rekening met omrijden en in- en uitstaptijd, zodat je vooraf een realistisch beeld hebt.",
          "Stel je maximale reistijd in bij Beschikbaarheid; diensten die daarboven vallen worden niet getoond.",
        ],
      },
    ],
  },
  {
    slug: "uitbetaling-en-facturen",
    category: "Geld",
    title: "Uitbetaling, facturen en sneller je geld",
    excerpt:
      "Reverse billing, en zelf kiezen hoe snel je uitbetaald wordt — van gratis wachten tot dezelfde dag, met de kosten die daarbij horen.",
    readMinutes: 5,
    updated: "2026-08-20",
    body: [
      {
        heading: "Geen facturen sturen",
        paragraphs: [
          "ZekerFlex werkt met reverse billing (self-billing). Zodra je uren zijn goedgekeurd, maakt het platform automatisch de factuur voor je dienst aan, met de juiste btw-behandeling — ook bij intra-EU opdrachten.",
        ],
      },
      {
        heading: "Wanneer krijg je je geld?",
        paragraphs: [
          "Je wordt niet automatisch meteen uitbetaald — je kiest zelf, per dienst, hoe snel je je geld wilt.",
          "De opties: betaalopdracht direct indienen (4% van de factuur), binnen 3 werkdagen indienen (2%), of gratis wachten tot de opdrachtgever afrekent (0%, binnen 30 dagen). De bijschrijving bij een externe bank kan langer duren.",
          "De fee wordt ingehouden op de totale factuur, zodat je vooraf precies weet wat er netto overblijft.",
        ],
      },
      {
        heading: "Voorschot",
        paragraphs: [
          "Je kunt ook een voorschot aanvragen op je openstaande diensten: maximaal 80% van wat er nog aankomt, tegen 3% over het voorgeschoten bedrag. Dat wordt automatisch verrekend met je volgende uitbetaling.",
        ],
      },
    ],
  },
  {
    slug: "verificatie-en-documenten",
    category: "Account",
    title: "Verificatie: KVK, identiteit en je documenten",
    excerpt:
      "Wat je nodig hebt om aan de slag te kunnen: KVK of werkvorm, identiteitscontrole, en het verplichte identiteitsbewijs en bankafschrift.",
    readMinutes: 4,
    updated: "2026-08-25",
    body: [
      {
        heading: "Werkvorm en KVK",
        paragraphs: [
          "Bij aanmelden kies je je werkvorm: zzp'er (met KVK en btw), flexwerker (btw optioneel, eventueel kleineondernemersregeling) of uitzendkracht (verloning via payroll, met BSN).",
          "Voor zzp en flex koppelen we je KVK-inschrijving en controleren we die bij het Handelsregister.",
        ],
      },
      {
        heading: "Identiteit en documenten",
        paragraphs: [
          "De identiteitscontrole gaat via een korte digitale check. Daarnaast upload je een identiteitsbewijs (paspoort of ID-kaart) en een recent bankafschrift waarop je naam en IBAN staan — die IBAN wordt gecontroleerd voordat er uitbetaald kan worden.",
          "ZekerFlex gebruikt dienstverleners voor onderdelen van het platform. Je BSN wordt versleuteld opgeslagen; in de app wordt het niet als volledig nummer getoond.",
        ],
      },
    ],
  },
];

export const POSTS: Post[] = [
  {
    slug: "handhaving-wet-dba-2026",
    title: "Handhaving Wet DBA in 2026: wat verandert er echt?",
    excerpt:
      "De Belastingdienst handhaaft weer op schijnzelfstandigheid. We zetten op een rij wat dat betekent voor freelancers en opdrachtgevers — en waarom paniek niet nodig is.",
    author: "Team ZekerFlex",
    date: "2026-08-18",
    readMinutes: 5,
    body: [
      {
        paragraphs: [
          "Sinds begin 2025 is het handhavingsmoratorium op de Wet DBA voorbij. In 2026 zien we dat de Belastingdienst gerichter kijkt naar opdrachten waar de zelfstandigheid twijfelachtig is: langdurige inhuur op een vaste plek, werk onder duidelijke aansturing, en freelancers die vrijwel al hun omzet bij één klant halen.",
        ],
      },
      {
        heading: "Wat je nu kunt doen",
        paragraphs: [
          "Werk met een geldige modelovereenkomst en zorg dat de praktijk daarmee overeenkomt. Spreid je opdrachten. En houd je urenverdeling per opdrachtgever in de gaten.",
          "Op ZekerFlex zit dit ingebouwd: de modelovereenkomst wordt automatisch klaargezet, en het platform grijpt in als een samenwerking richting een risicogrens loopt.",
        ],
      },
      {
        heading: "Voor opdrachtgevers",
        paragraphs: [
          "Kijk niet alleen naar het contract, maar naar hoe het werk feitelijk verloopt. Geef zelfstandigen ruimte om hun werk in te delen en zich te laten vervangen. In het compliance-overzicht van ZekerFlex zie je per kracht een risicosignaal met uitleg.",
        ],
      },
    ],
  },
  {
    slug: "sovereign-box",
    title: "Hoe ZekerFlex met gegevens en dienstverleners omgaat",
    excerpt:
      "Welke diensten ZekerFlex gebruikt voor hosting, betalingen, e-mail, AI en identiteitscontroles — en waar je leest hoe we met gegevens omgaan.",
    author: "Team ZekerFlex",
    date: "2026-07-30",
    readMinutes: 4,
    body: [
      {
        paragraphs: [
          "Een online platform gebruikt vaak verschillende technische diensten. Bij ZekerFlex gaat het onder meer om hosting, betalingen, e-mail en identiteitscontroles. Welke dienst bij een verwerking betrokken is, hangt af van de functie die je gebruikt.",
        ],
      },
      {
        heading: "Onze aanpak",
        paragraphs: [
          "De AI-assistent kan gebruikmaken van een eigen modelserver. Voor andere onderdelen gebruiken we gespecialiseerde dienstverleners, zoals hosting- en betaaldiensten. Raadpleeg het privacybeleid voor de soorten gegevens die we verwerken, de doelen en de betrokken partijen.",
          "We beperken toegang tot gegevens tot wat nodig is voor de dienst. Je kunt bij ons terecht met vragen over inzage, correctie of verwijdering; wettelijke bewaarplichten kunnen daarbij gelden.",
        ],
      },
    ],
  },
  {
    slug: "dezelfde-dag-uitbetaald",
    title: "Dezelfde dag uitbetaald — als jij daarvoor kiest",
    excerpt:
      "Geen factoringmaatschappij, geen verplichte constructie. Jij bepaalt per dienst hoe snel je je geld wilt — en wat dat kost.",
    author: "Team ZekerFlex",
    date: "2026-06-28",
    readMinutes: 3,
    body: [
      {
        paragraphs: [
          "Wachten op je geld is een van de grootste frustraties van flexwerk. Daarom laten we bij ZekerFlex de keuze bij jou: zodra je uren zijn goedgekeurd, kies je zelf hoe snel je uitbetaald wilt worden.",
          "Gratis wachten tot de opdrachtgever binnen 30 dagen afrekent kan altijd. Wil je eerder je geld, dan zet je een snellere uitbetaling aan: de betaalopdracht wordt direct na goedkeuring ingediend (4% van de factuur) of binnen 3 werkdagen (2%). De bank kan daarna extra verwerkingstijd nodig hebben. De fee wordt ingehouden op de factuur, dus je weet vooraf wat er netto overblijft.",
          "Achter de schermen wordt de factuur automatisch aangemaakt en een directe SEPA-overboeking klaargezet — geen voorschotconstructie, geen externe partij ertussen.",
        ],
      },
    ],
  },
];

export const FULL_FAQ: { category: string; items: { q: string; a: string }[] }[] = [
  {
    category: "Aan de slag",
    items: [
      { q: "Hoe meld ik me aan?", a: "Via 'Start vandaag'. Je kiest je werkvorm (zzp, flexwerker of uitzendkracht), koppelt je KVK of loongegevens en doorloopt een korte identiteitscontrole. Bedrijven registreren hun organisatie en kunnen daarna direct diensten uitzetten." },
      { q: "Wat kost het?", a: "Meedoen als freelancer is gratis. Bedrijven betalen € 3,50 platformkosten per gewerkt uur, en alleen wanneer er daadwerkelijk iemand werkt. Geen abonnement, geen opstartkosten." },
      { q: "Heb ik een KVK nodig?", a: "Als zzp'er wel. Als flexwerker is btw optioneel. Werk je als uitzendkracht, dan is ZekerFlex je werkgever en heb je geen eigen onderneming nodig." },
    ],
  },
  {
    category: "Werken & matching",
    items: [
      { q: "Waarom zie ik maar een deel van de diensten?", a: "De matching toont alleen aanbod waar je een sterke match voor bent, gewogen op vak, reistijd, betrouwbaarheid en beschikbaarheid." },
      { q: "Kan ik een tegenbod doen op een klus?", a: "Ja. Bij een dienst kun je vóór het accepteren een ander uurtarief voorstellen. De opdrachtgever keurt dat goed of af." },
      { q: "Wat als ik een aangenomen dienst niet kan doen?", a: "Je bent zelf verantwoordelijk voor een vervanger. Je klus wordt automatisch terug op het platform gezet met een 'Vervanging'-label. Onterecht afzeggen weegt mee in je betrouwbaarheidsscore." },
    ],
  },
  {
    category: "Geld & facturen",
    items: [
      { q: "Moet ik zelf facturen sturen?", a: "Nee. ZekerFlex werkt met reverse billing en maakt de facturen automatisch aan: één voor jouw dienst, één voor de platformkosten, met de juiste btw-behandeling." },
      { q: "Wanneer krijg ik mijn geld?", a: "Dat kies je zelf per dienst, nadat je uren zijn goedgekeurd: de betaalopdracht direct indienen (4% van de factuur), binnen 3 werkdagen indienen (2%) of gratis wachten tot de opdrachtgever afrekent (0%, binnen 30 dagen). De bijschrijving bij een externe bank kan daarna langer duren." },
      { q: "Kan ik een voorschot krijgen?", a: "Ja, op je eerstvolgende betaling. Kosten: 3% over het voorschot, automatisch verrekend met je volgende uitbetaling." },
    ],
  },
  {
    category: "Compliance & verzekering",
    items: [
      { q: "Is werken via ZekerFlex Wet DBA-proof?", a: "ZekerFlex legt afspraken vast en signaleert onder meer urenconcentratie, opeenvolgende weken en omzetafhankelijkheid. Dat geeft geen garantie over de arbeidsrelatie; de feitelijke werkwijze blijft bepalend." },
      { q: "Ben ik verzekerd tijdens een dienst?", a: "Ja. Zodra je een dienst accepteert val je onder de collectieve dekking van ZekerFlex: bedrijfsaansprakelijkheid, ongevallen tijdens werk en woon-werkverkeer, en rechtsbijstand bij een geschil uit de opdracht." },
      { q: "Wat gebeurt er met mijn gegevens?", a: "ZekerFlex gebruikt dienstverleners voor onderdelen van het platform. Je BSN wordt versleuteld opgeslagen en is alleen toegankelijk voor bevoegde medewerkers wanneer dat nodig is." },
    ],
  },
];

export function guideBySlug(slug: string): Article | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
export function postBySlug(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}

export function nlDate(iso: string): string {
  return new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
}
