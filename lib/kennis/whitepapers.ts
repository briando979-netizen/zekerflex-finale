// ---------------------------------------------------------------------------
// ZekerFlex whitepapers. Plain structured content (no third-party names, no
// external brands) rendered two ways:
//   • an HTML reader page at /kennis/whitepapers/[slug]
//   • a downloadable PDF from /api/kennis/whitepaper/[slug] (lib/pdf/whitepaper)
// Tax facts (KOR limit, ZVW %, kilometer rate, urencriterium) are Dutch law and
// kept as-is; platform figures follow the ZekerFlex money model
// (€3,50/uur werkgeversfee, uitbetaalkeuze 4% / 2% / 0%, voorschot 3%).
// ---------------------------------------------------------------------------

export type Block =
  | { t: "p"; text: string }
  | { t: "h3"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "note"; text: string };

export interface WhitepaperSection {
  heading: string;
  blocks: Block[];
}

export interface Whitepaper {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  updated: string; // ISO date
  readMinutes: number;
  intro: string;
  sections: WhitepaperSection[];
}

export const WHITEPAPERS: Whitepaper[] = [
  {
    slug: "werken-via-zekerflex",
    title: "Werken via ZekerFlex",
    subtitle: "Alles wat je moet weten als freelancer",
    category: "Aan de slag",
    updated: "2026-09-01",
    readMinutes: 9,
    intro:
      "Ga je voor de vrijheid van freelancen of voor de zekerheid van een dienstverband? Dit is hoe werken als freelancer via ZekerFlex werkt: van je eerste klus tot je uitbetaling.",
    sections: [
      {
        heading: "Freelancen versus loondienst",
        blocks: [
          {
            t: "p",
            text: "Als freelancer bepaal je zelf wanneer en hoeveel je werkt, en wat je uurtarief is. Daar staat tegenover dat je zelf verantwoordelijk bent voor je belastingaangifte, je pensioen en het opzijzetten van geld voor vakantie. In loondienst is dat andersom: een vast loon en veel automatisch geregeld, maar minder flexibiliteit.",
          },
          {
            t: "ul",
            items: [
              "Flexibele werktijden en afwisseling in opdrachten (freelance)",
              "Zelf je uurtarief bepalen (freelance)",
              "Vast loon en automatisch geregelde afdrachten (loondienst)",
              "Verplichte btw-aangifte en eigen administratie (freelance)",
            ],
          },
          {
            t: "note",
            text: "Werk je als freelancer via ZekerFlex, dan ben je vanaf je eerste klus kosteloos verzekerd voor ongevallen, bedrijfsaansprakelijkheid en arbeidsongeschiktheid. Zie de whitepaper 'Ben ik verzekerd?'.",
          },
        ],
      },
      {
        heading: "Starten als freelancer",
        blocks: [
          {
            t: "p",
            text: "Voor je eerste drie klussen via het platform heb je nog geen btw-id nodig. Zo kun je rustig kijken of flexibel werken bij je past. Daarna is een btw-id verplicht om te blijven klussen.",
          },
          {
            t: "h3",
            text: "Een btw-id aanvragen",
          },
          {
            t: "p",
            text: "Een btw-id vraag je aan bij de Kamer van Koophandel (samen met een KVK-nummer, handig als je fulltime wilt freelancen) of rechtstreeks bij de Belastingdienst (gratis, geschikt voor parttime, duurt ongeveer twee weken). Vraag het op tijd aan: zonder btw-id kun je na drie klussen niet verder.",
          },
          {
            t: "ul",
            items: [
              "Via de KVK: inschrijving in het Handelsregister, btw-id én KVK-nummer, mogelijkheid tot starters- of ondernemersaftrek",
              "Via de Belastingdienst: alleen een btw-id, gratis, ideaal als je er parttime bij klust",
            ],
          },
        ],
      },
      {
        heading: "Jouw verantwoordelijkheden",
        blocks: [
          {
            t: "p",
            text: "Als freelancer regel je een aantal dingen zelf. Reserveer hier vanaf je eerste factuur geld voor, dan kom je niet voor verrassingen te staan.",
          },
          {
            t: "ul",
            items: [
              "Omzetbelasting (btw): elk kwartaal aangifte, 21% over iedere factuur — tenzij je de kleineondernemersregeling gebruikt",
              "Inkomstenbelasting: jaarlijks aangifte tussen 1 maart en 1 mei over je winst",
              "Bijdrage Zorgverzekeringswet (ZVW): een inkomensafhankelijke premie die iedereen betaalt",
              "Pensioen: regel je zelf, bijvoorbeeld via een pensioenfonds voor zelfstandigen of door te beleggen",
            ],
          },
          {
            t: "note",
            text: "Reserveer als vuistregel ongeveer 20% van je winst voor de inkomstenbelasting en zet de ontvangen btw meteen apart op een aparte rekening.",
          },
        ],
      },
      {
        heading: "Jouw profiel",
        blocks: [
          {
            t: "p",
            text: "Opdrachtgevers kunnen kiezen uit meerdere freelancers. Als je reageert op een klus bekijken ze je profiel. Een compleet profiel vergroot je kans op leuke klussen.",
          },
          {
            t: "ul",
            items: [
              "Profielfoto: een recente, rustige foto van alleen je gezicht — lachen mag, zonnebril en groepsfoto's niet",
              "Werkervaring: waar je hebt gewerkt, wanneer en in welke functie",
              "Voorkeuren: welke branches je leuk vindt, zodat je klussenoverzicht op jou wordt afgestemd",
            ],
          },
        ],
      },
      {
        heading: "Zo werkt de app, stap voor stap",
        blocks: [
          {
            t: "ul",
            items: [
              "Zoek een klus: geef aan wat voor werk je zoekt en reageer op klussen die bij je passen",
              "Aan het werk: je krijgt een melding als je gekozen bent. Alle informatie staat in de app — zorg dat je op tijd bent",
              "Uren indienen: vul na de klus je uren in en laat een beoordeling achter voor de opdrachtgever",
              "Betaalkeuze: kies per klus hoe snel je je geld wilt (zie hieronder)",
            ],
          },
        ],
      },
      {
        heading: "Facturatie en je betaalkeuze",
        blocks: [
          {
            t: "p",
            text: "Wanneer je uren zijn goedgekeurd door de opdrachtgever, maakt ZekerFlex automatisch je factuur aan met de juiste btw-behandeling. Je hoeft zelf niets te sturen. Vanaf de goedkeuring kies je zelf, per klus, hoe snel je wordt uitbetaald:",
          },
          {
            t: "ul",
            items: [
              "Direct bij goedkeuring van je uren — kosten: 4% van het factuurbedrag",
              "Binnen 3 werkdagen — kosten: 2% van het factuurbedrag",
              "Wachten tot de opdrachtgever betaalt (binnen 30 dagen) — kosteloos",
            ],
          },
          {
            t: "p",
            text: "Bij de eerste twee opties draagt ZekerFlex het debiteurenrisico: je krijgt je geld ook als de opdrachtgever te laat of niet betaalt. Kies je voor wachten, dan draag je dat risico zelf. Een voorschot van maximaal 80% op je openstaande diensten kan tegen 3%.",
          },
        ],
      },
      {
        heading: "Annuleringstermijn en vervanging",
        blocks: [
          {
            t: "p",
            text: "Elke klus heeft een annuleringstermijn (bijvoorbeeld 24, 48 of 72 uur, of 1 tot 2 weken). Binnen die termijn mogen jij en de opdrachtgever zonder gevolgen annuleren. Daarna neem je altijd eerst contact op met de opdrachtgever; komen jullie er niet uit, dan wordt van je verwacht dat je een vervanger regelt.",
          },
          {
            t: "p",
            text: "Een vervanger moet een geverifieerd ZekerFlex-profiel hebben en voldoen aan de eisen, vaardigheden en kledingvoorschriften van de klus, en van gelijkwaardige kwaliteit zijn. Check vooraf de klusomschrijving en de modelovereenkomst.",
          },
        ],
      },
      {
        heading: "Als een klus niet wordt voltooid",
        blocks: [
          {
            t: "p",
            text: "Regel je geen (of niet op tijd) vervanging voor een klus die je niet kunt doen, dan krijg je een 'klus niet voltooid'-melding. Opdrachtgevers zien hoeveel klussen je hebt voltooid en hoe vaak je vervanging regelde. Over een periode van zes maanden gelden deze gevolgen bij te veel niet-voltooide klussen:",
          },
          {
            t: "ul",
            items: [
              "1e keer: officiële waarschuwing",
              "2e keer: twee weken niet kunnen reageren op nieuwe klussen",
              "3e keer: één maand niet kunnen reageren op nieuwe klussen",
              "4e keer: drie maanden niet kunnen reageren op nieuwe klussen",
            ],
          },
        ],
      },
    ],
  },

  {
    slug: "omzetbelasting",
    title: "Omzetbelasting",
    subtitle: "Btw aangeven als freelancer",
    category: "Geld",
    updated: "2026-09-01",
    readMinutes: 5,
    intro:
      "Als freelancer met een btw-id reken je btw over je omzet en draag je die elk kwartaal af. Zo werkt de aangifte, stap voor stap.",
    sections: [
      {
        heading: "Wat is omzetbelasting?",
        blocks: [
          {
            t: "p",
            text: "Omzetbelasting (btw) is 21% bovenop iedere factuur. Je ontvangt dat bedrag op je rekening, maar het is niet van jou: je houdt het apart voor de Belastingdienst en draagt het elk kwartaal af.",
          },
          {
            t: "note",
            text: "Gebruik je de kleineondernemersregeling (KOR)? Dan reken je geen btw en hoef je geen omzetbelastingaangifte te doen. Zie de whitepaper over de KOR.",
          },
        ],
      },
      {
        heading: "Wanneer doe je aangifte?",
        blocks: [
          {
            t: "p",
            text: "Elk kwartaal, binnen een maand na afloop van dat kwartaal:",
          },
          {
            t: "ul",
            items: [
              "Kwartaal 1 (jan–mrt): aangifte vóór 30 april",
              "Kwartaal 2 (apr–jun): aangifte vóór 31 juli",
              "Kwartaal 3 (jul–sep): aangifte vóór 31 oktober",
              "Kwartaal 4 (okt–dec): aangifte vóór 31 januari",
            ],
          },
        ],
      },
      {
        heading: "Hoe doe je de aangifte?",
        blocks: [
          {
            t: "ul",
            items: [
              "Check je omzet: tel in je ZekerFlex-dashboard het totaalbedrag exclusief btw van je facturen over het kwartaal op, en apart het totale btw-bedrag",
              "Bereken je onkosten: tel de btw van je zakelijke bonnen bij elkaar op (zie de whitepaper aftrekposten)",
              "Log in bij de Belastingdienst en open de aangifte voor het afgelopen kwartaal",
              "Vul je omzet in bij '1a. Leveringen/diensten belast met hoog tarief' en het btw-bedrag bij 'Btw'",
              "Vul de btw van je onkosten in bij '5b. Voorbelasting'",
              "Controleer, onderteken en verzend — je kunt daarna direct met iDEAL betalen",
            ],
          },
        ],
      },
      {
        heading: "Handig om te weten",
        blocks: [
          {
            t: "ul",
            items: [
              "Geen klussen gedaan dit kwartaal maar wel een btw-id? Dan moet je alsnog aangifte doen, anders riskeer je een boete",
              "Bij je eerste drie klussen (nog zonder btw-id) draag je geen omzetbelasting af",
              "Je kunt je facturen in je dashboard downloaden en naar jezelf mailen",
            ],
          },
        ],
      },
    ],
  },

  {
    slug: "inkomstenbelasting",
    title: "Inkomstenbelasting",
    subtitle: "Aangifte doen over je winst",
    category: "Geld",
    updated: "2026-09-01",
    readMinutes: 6,
    intro:
      "Iedereen in Nederland betaalt inkomstenbelasting. Als freelancer geef je zelf je inkomsten op — er is geen werkgever die dat voor je doet.",
    sections: [
      {
        heading: "Wat is inkomstenbelasting?",
        blocks: [
          {
            t: "p",
            text: "Inkomstenbelasting is de belasting over je inkomen. Je doet aangifte tussen 1 maart en 1 mei, op basis waarvan de Belastingdienst de aanslag berekent.",
          },
        ],
      },
      {
        heading: "Hoe werkt de aangifte?",
        blocks: [
          {
            t: "p",
            text: "In loondienst houdt de werkgever loonbelasting in en staat bij de aangifte alles voorgevuld. Als freelancer heb je geen loon maar omzet. Trek de btw en je onkosten eraf en je weet wat je winst is. Over die winst betaal je inkomstenbelasting.",
          },
          {
            t: "h3",
            text: "Onderneming of overige werkzaamheden?",
          },
          {
            t: "p",
            text: "Besteed je meer dan 1.225 uur per jaar (ongeveer 23 uur per week) aan je onderneming — inclusief klussen, administratie en reistijd — dan vul je je winst in bij 'Winst uit eigen onderneming'. Kom je daar niet aan, dan vul je de winst in bij 'Inkomsten uit overige werkzaamheden'. Dat laatste geldt voor de meeste freelancers en maakt de aangifte eenvoudig.",
          },
        ],
      },
      {
        heading: "De aangifte in 3 stappen",
        blocks: [
          {
            t: "ul",
            items: [
              "Bereken je winst: tel je facturen exclusief btw op, trek je zakelijke kosten exclusief btw eraf (zie de whitepaper aftrekposten)",
              "Log in bij de Belastingdienst",
              "Vul je winst in bij 'Inkomsten uit overige werkzaamheden' (of bij 'Winst uit onderneming' als je aan het urencriterium voldoet)",
            ],
          },
          {
            t: "note",
            text: "Ziet de Belastingdienst je als ondernemer? Dan is de aangifte ingewikkelder, maar heb je mogelijk recht op de zelfstandigenaftrek, startersaftrek en mkb-winstvrijstelling. Een boekhouder kan dan lonen.",
          },
        ],
      },
      {
        heading: "Bijdrage Zorgverzekeringswet",
        blocks: [
          {
            t: "p",
            text: "Naast inkomstenbelasting betaal je een inkomensafhankelijke bijdrage voor de Zorgverzekeringswet (ZVW), ook als je geen inkomstenbelasting hoeft te betalen. Deze bijdrage is 5,32% van je inkomen, over een maximaal inkomen van € 71.628. Je ontvangt hiervoor een aparte aanslag.",
          },
        ],
      },
      {
        heading: "Handig om te weten",
        blocks: [
          {
            t: "ul",
            items: [
              "Ook zonder klussen dit jaar moet je aangifte doen als je een onderneming hebt",
              "Bewaar bonnen, facturen en afschriften minimaal 7 jaar — een controle kan altijd",
              "Werk je er naast in loondienst? Dan komt je freelance-inkomen bovenop je loon en kan het in een hoger tarief vallen",
            ],
          },
        ],
      },
    ],
  },

  {
    slug: "kleineondernemersregeling",
    title: "De kleineondernemersregeling",
    subtitle: "Wanneer de KOR interessant is",
    category: "Geld",
    updated: "2026-09-01",
    readMinutes: 4,
    intro:
      "Met de kleineondernemersregeling (KOR) hoef je geen btw te rekenen en geen omzetbelastingaangifte te doen. Handig bij een kleine omzet, maar niet altijd voordelig.",
    sections: [
      {
        heading: "Wat houdt de KOR in?",
        blocks: [
          {
            t: "p",
            text: "Je kunt de KOR gebruiken als je jaaromzet maximaal € 20.000 is — in het jaar waarin je je aanmeldt én het jaar daarvoor. Alleen de omzet van je freelance-klussen telt mee; loon uit een dienstverband niet.",
          },
          {
            t: "p",
            text: "Doe je mee, dan zorgt ZekerFlex dat er op je facturen geen btw meer staat. Je hebt minder administratie, maar je kunt ook geen btw op je zakelijke kosten en investeringen meer terugvragen.",
          },
        ],
      },
      {
        heading: "Voor- en nadelen",
        blocks: [
          {
            t: "h3",
            text: "Voordelen",
          },
          {
            t: "ul",
            items: [
              "Geen omzetbelastingaangifte meer (wel nog inkomstenbelasting)",
              "Je hoeft de ontvangen btw niet meer apart te zetten",
              "Minder administratieve rompslomp",
            ],
          },
          {
            t: "h3",
            text: "Nadelen",
          },
          {
            t: "ul",
            items: [
              "Je kunt geen btw op kosten en investeringen terugvragen — nadelig als je veel kosten maakt",
              "Meld je je af, dan kun je je in datzelfde jaar en het jaar daarna niet opnieuw aanmelden",
            ],
          },
        ],
      },
      {
        heading: "Wat moet je doen?",
        blocks: [
          {
            t: "p",
            text: "Wil je de KOR gebruiken, vraag hem dan aan via Mijn Belastingdienst Zakelijk. Sinds 1 januari 2025 hoef je niet meer verplicht drie jaar mee te doen: je kunt je op elk moment afmelden. Komt je omzet in een jaar boven € 20.000, meld je dan meteen af.",
          },
          {
            t: "note",
            text: "Geef je keuze door in je ZekerFlex-profiel, want wij maken je facturen. Wacht met de ingangsdatum tot je bevestiging van de Belastingdienst hebt. Per ongeluk verkeerd ingesteld? Neem dan zo snel mogelijk contact op met support@zekerflex.com.",
          },
        ],
      },
    ],
  },

  {
    slug: "aftrekposten",
    title: "Aftrekposten",
    subtitle: "Btw terugvragen en kosten aftrekken",
    category: "Geld",
    updated: "2026-09-01",
    readMinutes: 8,
    intro:
      "Als ondernemer mag je de btw op zakelijke kosten terugvragen en die kosten van je winst aftrekken. Dat scheelt geld. Dit is hoe het werkt.",
    sections: [
      {
        heading: "Wat zijn zakelijke kosten?",
        blocks: [
          {
            t: "p",
            text: "Zakelijke kosten zijn uitgaven voor je onderneming. Op de bon of factuur staat de btw vermeld, meestal 21%, soms 9% (bijvoorbeeld op eten en drinken of openbaar vervoer). Per kwartaal geef je die btw op als voorbelasting bij je aangifte.",
          },
          {
            t: "ul",
            items: ["Werkkleding", "Telefoonkosten", "Zakelijke diensten", "Opleiding en scholing", "Reiskosten"],
          },
        ],
      },
      {
        heading: "Werkkleding",
        blocks: [
          {
            t: "p",
            text: "Verplicht een opdrachtgever specifieke werkkleding die je moet kopen, dan kun je de btw onder voorwaarden terugvragen. De Belastingdienst ziet kleding alleen als werkkleding als die vrijwel uitsluitend tijdens werk gedragen wordt, of een bedrijfslogo van minimaal 70 cm² heeft. Een zwarte spijkerbroek of andere algemeen bruikbare kleding telt niet mee.",
          },
          {
            t: "ul",
            items: [
              "Retail, horeca en promotiewerk: zwart-witte sneakers, overhemd, nette broek",
              "Logistiek: veiligheidsschoenen met stalen neus, specifieke handschoenen, VCA",
              "Schoonmaak: veiligheidsschoenen, zwarte werkbroek",
              "Bezorging: regenkleding, jas en handschoenen voor kou en wind",
            ],
          },
        ],
      },
      {
        heading: "Telefoon, diensten en opleiding",
        blocks: [
          {
            t: "ul",
            items: [
              "Telefoon: gebruik je je toestel deels zakelijk, dan mag je dat deel van de bel- en internetkosten aftrekken (niet de toestelafbetaling)",
              "Diensten: de btw van diensten met een zakelijk karakter kun je terugvragen — denk aan een boekhoudprogramma, zakelijke verzekeringen of de snelle-uitbetaaloptie van ZekerFlex",
              "Opleiding: alleen als een cursus noodzakelijk is om klussen te kunnen doen; puur uit eigen interesse mag niet",
            ],
          },
        ],
      },
      {
        heading: "Reiskosten",
        blocks: [
          {
            t: "p",
            text: "Op openbaar vervoer in Nederland zit 9% btw; die mag je van elke zakelijke rit terugvragen. Btw op autokosten kun je niet terugvragen, maar je mag wel een vast bedrag per zakelijke kilometer van je winst aftrekken: € 0,23 per kilometer, ook voor scooter en fiets.",
          },
          {
            t: "note",
            text: "Voorbeeld: 420 zakelijke kilometers in een jaar levert € 96,60 aftrek op (420 × € 0,23). Parkeer-, verzekerings- en brandstofkosten van een privé-auto zijn niet los aftrekbaar — die zitten al in het kilometerbedrag.",
          },
          {
            t: "p",
            text: "Heeft de opdrachtgever je reiskosten vergoed, dan mag je ze niet óók aftrekken. Houd van elke zakelijke rit datum, vertrek- en bestemmingsadres en de afstand (heen en terug) bij.",
          },
        ],
      },
      {
        heading: "Btw verrekenen: een voorbeeld",
        blocks: [
          {
            t: "p",
            text: "Stel: je werkt in een kwartaal 120 uur voor € 20 per uur exclusief btw en gebruikt de KOR niet. Je ontvangt dan € 24,20 per uur (€ 20 × 1,21), samen € 2.904, waarvan € 504 btw is.",
          },
          {
            t: "p",
            text: "Maakte je in dat kwartaal ook zakelijke kosten — bijvoorbeeld veiligheidsschoenen (€ 22,39 btw) en zakelijke treinritten (€ 15,28 btw), samen € 37,67 — dan trek je die af van de € 504. Je draagt dan nog € 466,33 aan btw af.",
          },
        ],
      },
      {
        heading: "Algemene aftrekposten",
        blocks: [
          {
            t: "p",
            text: "Besteed je minimaal 24 uur per week (1.225 uur per jaar) aan je onderneming, dan kun je in aanmerking komen voor extra belastingvoordeel. Aanvragen hoeft niet: bij je aangifte beantwoord je een paar vragen en wordt het automatisch berekend.",
          },
          {
            t: "ul",
            items: [
              "Zelfstandigenaftrek: een vast bedrag van je winst af, mits je aan het urencriterium van 1.225 uur voldoet",
              "Startersaftrek: in je eerste vijf jaar drie keer toe te passen, bovenop de zelfstandigenaftrek",
              "Mkb-winstvrijstelling: nadat de andere aftrekposten zijn toegepast, mag je 14% van de winst aftrekken",
            ],
          },
          {
            t: "note",
            text: "Geef je in je aangifte aan dat je recht hebt op de zelfstandigenaftrek terwijl dat niet zo is, dan riskeer je een boete. Houd je gewerkte uren daarom goed bij.",
          },
        ],
      },
    ],
  },

  {
    slug: "administratie",
    title: "Je administratie op orde",
    subtitle: "Praktische aanpak voor freelancers",
    category: "Geld",
    updated: "2026-09-01",
    readMinutes: 5,
    intro:
      "Een goede administratie kost weinig tijd als je het bijhoudt, en veel tijd als je het laat liggen. Zo houd je het simpel.",
    sections: [
      {
        heading: "Wat moet je bewaren?",
        blocks: [
          {
            t: "p",
            text: "Voor de Belastingdienst geldt een bewaarplicht van minimaal 7 jaar. Digitaal bewaren mag en is slim. Bewaar in elk geval:",
          },
          {
            t: "ul",
            items: [
              "Al je verkoopfacturen (staan in je ZekerFlex-dashboard, te downloaden als pdf)",
              "Bonnen en inkoopfacturen van je zakelijke kosten",
              "Je kilometerregistratie",
              "Bankafschriften van je zakelijke rekening",
            ],
          },
        ],
      },
      {
        heading: "Een boekhoudprogramma kiezen",
        blocks: [
          {
            t: "p",
            text: "Een boekhoudprogramma automatiseert je btw-aangifte en houdt je financiële overzicht bij. Let bij het kiezen op:",
          },
          {
            t: "ul",
            items: [
              "Bonnen scannen en facturen opslaan vanaf je telefoon",
              "Koppeling met je Nederlandse bank",
              "Automatische of half-automatische btw-aangifte per kwartaal",
              "Uren- en kilometerregistratie",
              "Duidelijke rapportages zonder vakjargon",
            ],
          },
          {
            t: "note",
            text: "Geen zin in administratie? Een boekhouder kan je btw- en inkomstenbelastingaangifte overnemen en zorgt dat je geen aftrekposten mist.",
          },
        ],
      },
      {
        heading: "Praktische tips",
        blocks: [
          {
            t: "ul",
            items: [
              "Plan een vast moment per week of maand om je administratie bij te werken",
              "Upload facturen en bonnen meteen — niet pas aan het einde van het kwartaal",
              "Zet de ontvangen btw direct apart op een aparte rekening",
              "Reserveer ongeveer 20% van je winst voor de inkomstenbelasting",
              "Gebruik de opties in je ZekerFlex-dashboard om facturen te downloaden en te mailen",
            ],
          },
        ],
      },
    ],
  },

  {
    slug: "verzekering",
    title: "Ben ik verzekerd?",
    subtitle: "De ZekerFlex-verzekering voor freelancers",
    category: "Zekerheid",
    updated: "2026-09-01",
    readMinutes: 6,
    intro:
      "Een ongeluk zit in een klein hoekje. In loondienst is verzekeren meestal geregeld; als freelancer moet je dat zelf doen. Werk je via ZekerFlex, dan regelen wij het — vanaf je eerste klus, kosteloos.",
    sections: [
      {
        heading: "Wat ZekerFlex regelt",
        blocks: [
          {
            t: "p",
            text: "Elke freelancer die via ZekerFlex werkt is vanaf de allereerste klus automatisch verzekerd via onze verzekeringspartner. Grote financiële problemen door aansprakelijkheid, een ongeval of letsel worden zo goed als voorkomen — voor jou én voor de opdrachtgever.",
          },
          {
            t: "p",
            text: "Nadat je ZekerFlex-account is geverifieerd, ontvang je van de verzekeringspartner een e-mail om een account aan te maken. Daarin zie je alle polisvoorwaarden en dien je een claim in. Zonder dat account ben je wél verzekerd, maar je hebt het nodig om te claimen.",
          },
        ],
      },
      {
        heading: "Waarvoor je verzekerd bent",
        blocks: [
          {
            t: "h3",
            text: "Ongevallen en ziekte",
          },
          {
            t: "p",
            text: "Een uitkering bij blijvende invaliditeit of overlijden, plus dekking voor onder meer medische kosten na een ongeval, ziekenhuisverblijf, botbreuken, tandschade en littekens in het gezicht.",
          },
          {
            t: "h3",
            text: "Bedrijfsaansprakelijkheid",
          },
          {
            t: "ul",
            items: [
              "Lichamelijk letsel van derden: gedekt tot € 2.500.000",
              "Materiële schade aan eigendommen van derden: gedekt tot € 2.500.000",
              "Kosten van juridische verdediging: tot € 15.000",
              "Eigen risico per claim: € 50",
            ],
          },
          {
            t: "h3",
            text: "Arbeidsongeschiktheid",
          },
          {
            t: "p",
            text: "Je komt in aanmerking na minimaal tien voltooide opdrachten in de 26 weken voor het ongeval of de ziekte. De eerste 52 weken keert de polis 90% van je gemiddelde inkomsten uit, van week 53 tot 104 is dat 75%, met een maximale dagvergoeding van € 30, voor maximaal twee jaar.",
          },
          {
            t: "h3",
            text: "Wellbeing en extra dekkingen",
          },
          {
            t: "ul",
            items: [
              "Digitale toegang tot een fysiotherapeut, huisarts en psycholoog, en financieel advies",
              "Financiële dekking tot € 500 voor familieverlof (geboorte) en rouwverlof (overlijden eerste- of tweedegraads familielid)",
            ],
          },
        ],
      },
      {
        heading: "Check wel de voorwaarden",
        blocks: [
          {
            t: "p",
            text: "Per onderdeel van de verzekering gelden voorwaarden. Bij een bedrijfsongeval kan een medische keuring nodig zijn; bij een schadegeval moet je bewijzen en documenten aanleveren. De volledige voorwaarden staan in je account bij de verzekeringspartner.",
          },
        ],
      },
      {
        heading: "Wat kost het?",
        blocks: [
          {
            t: "ul",
            items: [
              "Voor freelancers: geheel kosteloos",
              "Voor opdrachtgevers: de verzekering zit in de vaste platformkosten van € 3,50 per gewerkt uur",
            ],
          },
          {
            t: "p",
            text: "Voor de opdrachtgever betekent dit minder risico: veroorzaakt een freelancer schade, dan dekt de verzekering die kosten en wordt het incident professioneel afgehandeld.",
          },
        ],
      },
      {
        heading: "Een claim indienen",
        blocks: [
          {
            t: "p",
            text: "Ga in je account bij de verzekeringspartner naar 'claims', kies de dekking en doorloop de stappen. De claim wordt beoordeeld op de polisvoorwaarden en je bewijsmateriaal. Je krijgt elke twee weken een statusupdate. Is de claim goedgekeurd, dan staat het geld binnen vijf werkdagen op je rekening.",
          },
        ],
      },
    ],
  },
];

export function whitepaperBySlug(slug: string): Whitepaper | undefined {
  return WHITEPAPERS.find((w) => w.slug === slug);
}

export function whitepaperPlainText(w: Whitepaper): string {
  const lines: string[] = [w.title.toUpperCase(), w.subtitle, "", w.intro, ""];
  for (const s of w.sections) {
    lines.push("", s.heading.toUpperCase(), "");
    for (const b of s.blocks) {
      if (b.t === "p") lines.push(b.text, "");
      else if (b.t === "h3") lines.push(b.text, "");
      else if (b.t === "note") lines.push(`Let op: ${b.text}`, "");
      else for (const it of b.items) lines.push(`- ${it}`);
    }
  }
  return lines.join("\n");
}
