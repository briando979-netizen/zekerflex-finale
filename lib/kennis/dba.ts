// ---------------------------------------------------------------------------
// Wet DBA-kenniscentrum voor opdrachtgevers. Q&A over schijnzelfstandigheid,
// gezag, handhaving en hoe ZekerFlex het risico klein houdt. Ontmerkt: geen
// namen van andere platforms of partners; bedragen volgen het ZekerFlex-model
// (€3,50/uur platformfee, uitbetaalkeuze 4% / 2% / 0%).
// Algemene informatie — geen juridisch of fiscaal advies.
// ---------------------------------------------------------------------------

export interface DbaItem {
  q: string;
  /** lead answer (1–3 sentences) */
  a: string;
  /** optional supporting points, each as "Label: uitleg" */
  points?: string[];
  /** optional call-to-action link shown under the answer */
  link?: { href: string; label: string };
}

export interface DbaGroup {
  category: string;
  blurb: string;
  items: DbaItem[];
}

export const BELASTINGDIENST_CHECKLIST = {
  title: "Hoe bereid je je als bedrijf voor op een bezoek van de Belastingdienst?",
  intro: "Geen paniek. Zorg dat je dossier op orde is.",
  points: [
    {
      label: "Modelovereenkomst",
      text: "Werk met de modelovereenkomsten van ZekerFlex. Die leggen vast dat je samenwerkt op basis van zelfstandigheid.",
    },
    {
      label: "Bewijs",
      text: "Bewaar de facturen en zorg dat je kunt laten zien dat de freelancer als ondernemer werkt — bijvoorbeeld via vervanging, meerdere opdrachtgevers of een eigen btw-nummer.",
    },
    {
      label: "Checklist",
      text: "Gebruik de Wet DBA-monitor in je ZekerFlex-dashboard om te zien of een samenwerking risico loopt.",
    },
    {
      label: "Logboek",
      text: "Elke opdracht heeft een volledig digitaal dossier: wie, wanneer, welk tarief, welke overeenkomst en hoe de check-in verliep. Daarmee toon je aan hoe de samenwerking in de praktijk werkte.",
    },
  ],
};

export const DBA_GROUPS: DbaGroup[] = [
  {
    category: "De basisbegrippen",
    blurb: "De termen die de Belastingdienst gebruikt, in gewone taal.",
    items: [
      {
        q: "Wat is een 'fictieve dienstbetrekking'?",
        a: "Dat betekent dat iemand op papier freelancer is, maar dat de wet zegt: dit lijkt zó erg op een werknemer dat we het toch als loondienst behandelen.",
        points: [
          "Het gevolg: je moet alsnog loonbelasting en premies afdragen (een naheffing).",
          "Voorkomen: zorg dat de freelancer echt vrij is in hoe die het werk doet, voor meerdere opdrachtgevers werkt en zich mag laten vervangen.",
        ],
      },
      {
        q: "Wat zijn de 'ondernemerscriteria'?",
        a: "Dat is het lijstje dat de Belastingdienst afvinkt om te bepalen of iemand echt ondernemer is.",
        points: [
          "De belangrijkste punten: werkt de freelancer voor meerdere opdrachtgevers, loopt die risico (geen werk = geen geld) en doet die eigen investeringen?",
          "Via ZekerFlex: we stimuleren freelancers om voor verschillende opdrachtgevers te werken, en het merendeel doet dat ook.",
        ],
      },
      {
        q: "Geldt de VAR (Verklaring Arbeidsrelatie) nog?",
        a: "Nee. De VAR is in 2016 afgeschaft. Je kunt geen VAR-verklaring meer opvragen bij een freelancer.",
        points: [
          "Wat er nu is: de Wet DBA en modelovereenkomsten. Elke opdracht via ZekerFlex loopt onder een goedgekeurde modelovereenkomst.",
        ],
      },
      {
        q: "Waarom zijn een btw-id en KvK-nummer belangrijk?",
        a: "Dat zijn de bewijsstukken dat iemand voor de Belastingdienst een ondernemer is: een btw-id laat zien dat iemand belasting afdraagt over de omzet, een KvK-inschrijving dat iemand officieel als bedrijf staat geregistreerd.",
        points: [
          "ZekerFlex-check: nieuwe freelancers mogen maximaal 3 klussen doen om te proeven (via de UBD-regeling). Daarna is een btw-id of KvK-nummer verplicht om via ons te werken.",
        ],
      },
      {
        q: "Wat is 'doorlening' of 'vrije vervanging'?",
        a: "Het ultieme bewijs van onafhankelijkheid: een freelancer mag, als die zelf niet kan, iemand anders sturen om het werk te doen. Een werknemer in loondienst mag dat nooit.",
        points: [
          "Op ZekerFlex: kan een freelancer een klus niet doen, dan regelt die via het platform een vervanger. De factuur komt op naam van de persoon die het werk daadwerkelijk heeft gedaan.",
        ],
      },
    ],
  },
  {
    category: "Gezag, instructies en inbedding",
    blurb: "De grens tussen 'sturen op resultaat' en 'leidinggeven aan personeel'.",
    items: [
      {
        q: "Wat is 'aanwijzingsbevoegdheid'?",
        a: "Dat gaat over wie de baas is. Je mag instructies geven over het resultaat, maar niet over hoe iemand het precies moet doen.",
        points: [
          "Mag wel: 'De vrachtwagen moet om 17:00 uur leeg zijn' of 'De gasten moeten tevreden zijn'.",
          "Mag niet: 'Je moet deze schoenen aan, eerst je linkerhand gebruiken en pauze houden als ik het zeg'. Dat is leidinggeven aan personeel.",
        ],
      },
      {
        q: "Wanneer is een instructie geven 'fout'?",
        a: "Er is verschil tussen wat er moet gebeuren en hoe het moet gebeuren.",
        points: [
          "Doelgericht (goed): 'De bar moet om 17:00 uur open zijn en de gasten moeten tevreden zijn.'",
          "Gezag (vermijden): 'Doe eerst je linkerschoen aan, neem deze looproute en zeg precies deze zinnen.'",
          "Tip: geef instructies over het eindresultaat, niet over elke stap in het proces.",
        ],
      },
      {
        q: "Moeten freelancers hun werktijden zelf kunnen bepalen?",
        a: "In de basis wel — dat hoort bij vrijheid. In de praktijk begint een evenement of horecadienst natuurlijk op een vast tijdstip, en dat is logisch.",
        points: [
          "Het verschil: een freelancer schrijft zich in op een klus waarbij begin- en eindtijd vermeld staan en kiest daar dus zelf voor. Een werknemer wordt ingeroosterd door de baas.",
        ],
      },
      {
        q: "Wat bedoelen ze met 'inbedding in de organisatie'?",
        a: "Een chic woord voor: hoort de freelancer bij het meubilair? Doet die exact hetzelfde werk als je vaste medewerkers, draagt die bedrijfskleding, gaat die mee met teamuitjes en staat die in het vaste rooster?",
        points: [
          "De oplossing: behandel een freelancer als een externe expert of tijdelijke kracht en geef die de ruimte om het werk op de eigen manier te doen.",
        ],
      },
      {
        q: "Als freelancers hetzelfde werk doen als vast personeel, mag dat dan?",
        a: "Ja, dat mag, maar let op de 'inbedding'. Als een freelancer exact hetzelfde doet als een werknemer, zij-aan-zij staat, meegaat met teamuitjes en dezelfde bonussen krijgt, lijkt het op loondienst.",
        points: [
          "De oplossing: zorg dat het werk tijdelijk is (een piek of ziekte) of dat de freelancer specifieke expertise heeft. Behandel de freelancer als externe expert, niet als eigen personeel.",
        ],
      },
    ],
  },
  {
    category: "Uren en tarief",
    blurb: "Wat er klopt van de bekende vuistregels — en wat niet.",
    items: [
      {
        q: "Is de grens van 650 uur werken nog van toepassing?",
        a: "Er is geen harde wet die zegt dat je stopt bij 650 uur. Het is een hulpmiddel: werk je heel veel uren voor één opdrachtgever, dan lijk je meer op een werknemer.",
        points: [
          "ZekerFlex-signaal: je krijgt een melding als een freelancer richting de 600 uur voor één opdrachtgever gaat. Zo blijft de samenwerking scherp; de freelancer blijft zelf verantwoordelijk.",
        ],
      },
      {
        q: "Is een minimumtarief van € 36 per uur wettelijk verplicht?",
        a: "Nee, dat is nog geen wet. Een bedrag van ongeveer € 32 tot € 36 wordt genoemd in het wetsvoorstel Zelfstandigenwet, maar is nu niet verplicht.",
        points: [
          "Advies: een marktconform uurtarief laat wél zien dat een freelancer echt zelfstandig is. Dat helpt discussie voorkomen.",
        ],
      },
      {
        q: "Wat is het 'rechtsvermoeden'?",
        a: "Als een freelancer een laag tarief krijgt (onder een bepaald bedrag), kan die makkelijker claimen dat er sprake is van loondienst.",
        points: [
          "Let op: de freelancer moet dit zelf doen, via de rechter. Het gebeurt niet automatisch.",
        ],
      },
    ],
  },
  {
    category: "Risico's en handhaving",
    blurb: "Wie draait ergens voor op, en hoe streng is de Belastingdienst in 2026?",
    items: [
      {
        q: "Bij wie liggen de risico's: bij de freelancer of de opdrachtgever?",
        a: "De Belastingdienst kijkt primair naar de opdrachtgever. Is er toch sprake van loondienst, dan klopt de fiscus bij jou aan voor de naheffing van loonheffing en premies.",
        points: [
          "De freelancer loopt het risico fiscale voordelen (zoals de zelfstandigenaftrek) kwijt te raken.",
          "ZekerFlex helpt: de juiste contracten, checks aan de poort (ID-check, KvK/btw) en een volledig digitaal dossier per opdracht.",
        ],
      },
      {
        q: "Wat zijn de risico's als het wél schijnzelfstandigheid is?",
        a: "Vindt de Belastingdienst dat iemand eigenlijk in loondienst is (geweest), dan kun je een naheffing krijgen: je betaalt alsnog de loonbelasting en premies die niet zijn afgedragen.",
        points: [
          "In 2026 komt daar nog geen extra boete bovenop, tenzij de Belastingdienst kan bewijzen dat het met opzet ging.",
        ],
      },
      {
        q: "Wat is een verzuimboete, en wat is het verschil met een vergrijpboete?",
        a: "Een verzuimboete is de tik op de vingers voor administratieve slordigheid, zonder kwade wil. Een vergrijpboete is de zware hamer: die krijg je bij opzet of grove schuld — dat is fraude.",
        points: [
          "De bewijslast voor een vergrijpboete ligt hoger, maar de bedragen ook.",
        ],
      },
      {
        q: "Gaan er in 2026 dingen veranderen in de handhaving?",
        a: "De Belastingdienst controleert weer volop — de 'pauze' is voorbij. Maar we zitten nog in een overgangsfase.",
        points: [
          "Maak je per ongeluk een fout in de inhuur, dan volgt in 2026 nog geen verzuimboete maar een corrigerend gesprek.",
          "Alleen bij kwaadwillendheid (bewust de regels negeren) kan de Belastingdienst wél ingrijpen.",
          "Conclusie: doe je je best om het goed te regelen en leg je inspanningen vast, dan hoef je je geen zorgen te maken.",
        ],
      },
    ],
  },
  {
    category: "Wetgeving en politiek",
    blurb: "Wat er op tafel ligt en wat dat nu voor je betekent.",
    items: [
      {
        q: "Wat is de laatste stand van zaken rondom nieuwe wetten (zoals VBAR)?",
        a: "Er werd lang gepraat over de wet VBAR, die zou bepalen wanneer je wel of geen zzp'er bent. Dat ingewikkelde deel is van tafel; het kabinet richt zich op een Zelfstandigenwet.",
        points: [
          "Planning: de Zelfstandigenwet moet nog door de Tweede en Eerste Kamer. Verwachting is op zijn vroegst eind 2026, mogelijk later.",
          "Wat betekent dit nu? Voorlopig verandert er niets. Je kunt blijven werken zoals je gewend bent.",
        ],
      },
      {
        q: "Welke wetsvoorstellen liggen er nu op tafel?",
        a: "In plaats van de VBAR komt er waarschijnlijk een Zelfstandigenwet. Die kijkt vooral naar: willen de freelancer en jij bewust als zelfstandigen samenwerken?",
        points: [
          "Het 'rechtsvermoeden' blijft bestaan: bij een laag tarief kan een freelancer makkelijker via de rechter loondienst claimen.",
        ],
      },
      {
        q: "Wat kan het nieuwe kabinet betekenen voor de beoordeling?",
        a: "De wind waait een gunstige kant op. Het kabinet wil ondernemers meer ruimte geven en kiest voor de Zelfstandigenwet in plaats van regels die de markt op slot zetten.",
        points: [
          "Het doel: het makkelijker maken om als zelfstandige te werken als je dat zelf wilt.",
        ],
      },
    ],
  },
  {
    category: "Werken via ZekerFlex — praktisch",
    blurb: "Onboarding, tarieven, betaling en je zorgplicht.",
    items: [
      {
        q: "Hoe werkt de onboarding voor een freelancer precies?",
        a: "Een freelancer mag pas starten als we zeker weten wie het is.",
        points: [
          "Aanmelden: account aanmaken in de app.",
          "ID-check: paspoort of ID-kaart scannen (geen rijbewijs). Onze partner checkt de identiteit én of iemand in Nederland mag werken.",
          "Profiel vullen: foto, ervaring en skills.",
          "Eerste klus: direct reageren mogelijk; de eerste 3 klussen zonder btw-id (via de UBD-regeling).",
          "Ondernemer worden: na 3 klussen is een btw-id verplicht om verder te kunnen.",
        ],
      },
      {
        q: "Hoe zit het met buitenlandse freelancers?",
        a: "Iedereen mag via ons werken, mits die in Nederland mag werken.",
        points: [
          "EU/EER-burgers: welkom, met een geldig paspoort/ID en een BSN.",
          "Niet-EU: een verblijfsvergunning met de tekst 'Arbeid vrij toegestaan'.",
          "Let op: studenten van buiten de EU mogen vaak alleen in loondienst werken (met tewerkstellingsvergunning). Dat ondersteunen we niet als freelance-platform.",
        ],
      },
      {
        q: "Mag een freelancer werken met een BV?",
        a: "Nee. Op ZekerFlex werk je als eenmanszaak. Het platform en de modelovereenkomsten zijn ingericht op de natuurlijke persoon die zelf het werk doet. Met een BV of VOF kun je (nog) geen account aanmaken.",
      },
      {
        q: "Wat is factoring (directe betaling)?",
        a: "Dat betekent dat ZekerFlex het geld voorschiet. De freelancer kan kiezen om direct bij goedkeuring van de uren of binnen 3 werkdagen uitbetaald te worden, tegen een fee, in plaats van te wachten tot jij betaalt.",
        points: [
          "Voor jou: je betaalt gewoon binnen de afgesproken termijn (bijvoorbeeld 14 of 30 dagen) aan ZekerFlex. Je merkt er niets van, maar je freelancer is extra blij.",
        ],
      },
      {
        q: "Wat is het verschil tussen uurtarief en platformfee?",
        a: "Het uurtarief is wat de freelancer verdient (bijvoorbeeld € 19 per uur). De platformkosten zijn wat jij als opdrachtgever aan ZekerFlex betaalt voor het platform, de verzekering en de service: € 3,50 per gewerkt uur.",
        points: [
          "Op de factuur zie je het uurtarief én de platformkosten apart. Helder en transparant.",
        ],
      },
      {
        q: "Wat is mijn 'zorgplicht' als opdrachtgever?",
        a: "Je bent verantwoordelijk voor een veilige werkplek voor iedereen die bij je over de vloer komt. De Arbowet geldt ook voor freelancers: zorg dat ze veilig kunnen werken en veiligheidsinstructies krijgen.",
        points: [
          "Verzekering: gaat er toch iets mis, dan zijn freelancers via ZekerFlex automatisch verzekerd voor ongevallen en aansprakelijkheid via onze verzekeringspartner.",
        ],
      },
    ],
  },
  {
    category: "Waarom kiezen mensen hiervoor?",
    blurb: "Flexibel werken is voor veel mensen een bewuste keuze.",
    items: [
      {
        q: "Waarom kiezen jongeren voor deze manier van werken?",
        a: "Jongeren willen vrijheid. Volgens onderzoek van de Universiteit Maastricht vindt een ruime meerderheid flexibiliteit en autonomie belangrijker dan een vast contract.",
        points: [
          "Ze combineren werk met studie of hobby's.",
          "Ze bepalen zelf waar, wanneer en hoeveel ze werken.",
          "Het is een bewuste keuze: geen slachtoffer, maar ondernemer.",
        ],
      },
    ],
  },
];

/** Flattened for schema.org FAQPage / search. */
export function dbaFaqFlat(): { q: string; a: string }[] {
  return DBA_GROUPS.flatMap((g) =>
    g.items.map((it) => ({
      q: it.q,
      a: it.points ? `${it.a} ${it.points.join(" ")}` : it.a,
    })),
  );
}
