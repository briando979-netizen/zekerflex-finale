// ---------------------------------------------------------------------------
// De leskaart: de onderdelen waarop een instructeur een leerling beoordeelt,
// in zes fases van eerste les tot examen. Eigen indeling en eigen uitleg van
// ZekerFlex. Per onderdeel een korte voorbereiding die de leerling thuis leest
// (huiswerk) en die de instructeur tijdens de les open heeft. Puur en
// client-veilig: de leerling-app en de instructeur-app rekenen hiermee.
// ---------------------------------------------------------------------------

export interface Onderdeel {
  sleutel: string;
  titel: string;
  uitleg: string;
  stappen: string[];
}

export interface Fase {
  sleutel: string;
  titel: string;
  omschrijving: string;
  onderdelen: Onderdeel[];
}

export const SCORES = [
  { score: 1, label: "Uitgelegd", tekst: "We hebben het besproken of voorgedaan." },
  { score: 2, label: "Met veel hulp", tekst: "Lukt met duidelijke aanwijzingen." },
  { score: 3, label: "Met een beetje hulp", tekst: "Lukt meestal, soms een tip nodig." },
  { score: 4, label: "Zelfstandig", tekst: "Lukt zonder hulp in gewone situaties." },
  { score: 5, label: "Examenniveau", tekst: "Gaat goed, ook als het druk of lastig is." },
] as const;

export const FASES: Fase[] = [
  {
    sleutel: "bediening",
    titel: "Auto en bediening",
    omschrijving: "De auto leren kennen en soepel wegrijden, schakelen en stoppen.",
    onderdelen: [
      {
        sleutel: "voorbereiding",
        titel: "Instappen en afstellen",
        uitleg: "Een goede zithouding geeft overzicht en rust. Je stelt alles af voordat de motor loopt.",
        stappen: [
          "Loop om de auto heen: banden, lampen, niets onder of achter de auto.",
          "Stoel: je voet drukt de koppeling helemaal in met de knie nog licht gebogen.",
          "Hoofdsteun ongeveer gelijk met de bovenkant van je hoofd.",
          "Spiegels zo dat je net een stukje van je eigen auto ziet.",
          "Gordel om en controleer dat iedereen in de auto de gordel draagt.",
        ],
      },
      {
        sleutel: "wegrijden",
        titel: "Wegrijden en stoppen",
        uitleg: "Wegrijden is kijken, aangeven en dan pas rijden. Stoppen doe je rustig en op de plek die je zelf kiest.",
        stappen: [
          "Koppeling in, eerste versnelling, licht gas.",
          "Kijk in de spiegels én over je schouder (dode hoek).",
          "Richting aangeven, handrem los, koppeling langzaam opkomen tot het aangrijpingspunt.",
          "Stoppen: op tijd gas los, rustig remmen, vlak voor stilstand koppeling in.",
        ],
      },
      {
        sleutel: "schakelen",
        titel: "Schakelen en snelheid",
        uitleg: "Op het juiste moment schakelen houdt de auto soepel en zuinig. Luister naar de motor en kijk vooruit.",
        stappen: [
          "Opschakelen rond 2000–2500 toeren (benzine) of eerder bij diesel.",
          "Terugschakelen voordat je het vermogen nodig hebt, niet erna.",
          "Hand terug aan het stuur zodra je geschakeld hebt.",
          "Bij automaat: rustig gas geven en vroeg gas loslaten.",
        ],
      },
      {
        sleutel: "sturen",
        titel: "Sturen en koers houden",
        uitleg: "Je stuurt waar je kijkt. Kijk ver vooruit en de auto rijdt vanzelf rechter.",
        stappen: [
          "Handen op kwart voor drie, duimen langs de rand.",
          "Kijk ver vooruit in plaats van vlak voor de auto.",
          "In bochten: voor de bocht snelheid omlaag, in de bocht rustig gas.",
          "Kleine stuurbewegingen, geen schokken.",
        ],
      },
      {
        sleutel: "remmen",
        titel: "Remmen en stoppen op een punt",
        uitleg: "Goed remmen is vooruitzien: hoe eerder je een situatie ziet, hoe rustiger je kunt remmen.",
        stappen: [
          "Eerst gas los, dan geleidelijk remmen.",
          "Vlak voor stilstand rem iets lossen voor een zachte stop.",
          "Stop op de stopstreep of vlak ervoor, niet erover.",
          "Achter een ander voertuig: je ziet zijn achterbanden nog op het wegdek.",
        ],
      },
    ],
  },
  {
    sleutel: "kijken",
    titel: "Kijken en inschatten",
    omschrijving: "Overzicht houden, de juiste plek op de weg en de juiste snelheid.",
    onderdelen: [
      {
        sleutel: "kijktechniek",
        titel: "Kijktechniek",
        uitleg: "Wie goed kijkt, hoeft zelden hard te remmen. Je kijkt ver vooruit, dichtbij, opzij en achter.",
        stappen: [
          "Kijk zo ver mogelijk vooruit en laat je blik steeds bewegen.",
          "Om de 5 à 10 seconden een blik in de binnenspiegel.",
          "Voor elke zijwaartse beweging: spiegel én schoudercontrole.",
          "Zoek naar aanwijzingen: een bal op straat, een openstaand portier, remlichten verderop.",
        ],
      },
      {
        sleutel: "plaats-op-de-weg",
        titel: "Plaats op de weg",
        uitleg: "Je rijdt rechts, maar niet tegen de stoeprand. Voor het afslaan kies je op tijd de juiste rijstrook.",
        stappen: [
          "Rijd rechts op je weghelft met wat ruimte tot de rand.",
          "Kies de voorsorteervak op tijd; kijk naar de pijlen op het wegdek.",
          "Houd ruimte naar geparkeerde auto's (portieren!).",
          "Na het inhalen of afslaan weer netjes rechts.",
        ],
      },
      {
        sleutel: "snelheid",
        titel: "Snelheid kiezen",
        uitleg: "De maximumsnelheid is een grens, geen doel. Je past je snelheid aan op drukte, zicht en weer.",
        stappen: [
          "Weet de limiet: kijk naar borden en het soort weg.",
          "Langzamer bij scholen, in woonwijken, bij regen of slecht zicht.",
          "Rijd mee met het verkeer, niet onnodig langzaam op de snelweg.",
          "Snelheid omlaag vóór een bocht of kruispunt, niet erin.",
        ],
      },
      {
        sleutel: "afstand",
        titel: "Afstand houden",
        uitleg: "Genoeg afstand geeft je tijd om te reageren. Houd minstens twee seconden afstand, bij nat weer meer.",
        stappen: [
          "Kies een vast punt: tel 'eenentwintig, tweeëntwintig' als je voorganger het passeert.",
          "Ben je er eerder? Dan zit je te dichtbij.",
          "Bij regen, mist of gladheid minstens het dubbele.",
          "Ook in de file: zie de achterbanden van je voorganger.",
        ],
      },
    ],
  },
  {
    sleutel: "kruispunten",
    titel: "Kruispunten en voorrang",
    omschrijving: "Veilig door kruispunten, rotondes en verkeerslichten.",
    onderdelen: [
      {
        sleutel: "naderen",
        titel: "Kruispunten naderen",
        uitleg: "Elk kruispunt doe je in vaste stappen: herkennen, snelheid aanpassen, kijken en beslissen.",
        stappen: [
          "Herken het kruispunt op tijd: borden, haaientanden, zijwegen.",
          "Snelheid omlaag zodat je kunt stoppen als het nodig is.",
          "Kijk links, rechts en nog eens links; let op fietsers en voetgangers.",
          "Beslis pas als je alles hebt gezien.",
        ],
      },
      {
        sleutel: "voorrang",
        titel: "Voorrang verlenen",
        uitleg: "Weet wie er voorgaat: borden en haaientanden eerst, anders gaat verkeer van rechts voor.",
        stappen: [
          "Haaientanden of een voorrangsbord: jij geeft voorrang.",
          "Geen borden: bestuurders van rechts gaan voor, ook fietsers.",
          "Een tram heeft op een gelijkwaardig kruispunt altijd voorrang.",
          "Laat duidelijk zien wat je doet: rustig remmen of rustig doorrijden.",
        ],
      },
      {
        sleutel: "rechtsaf",
        titel: "Rechtsaf slaan",
        uitleg: "Bij rechtsaf zijn fietsers het grootste risico: zij gaan rechtdoor en hebben voorrang.",
        stappen: [
          "Op tijd richting aangeven en rechts voorsorteren.",
          "Spiegel én schouder rechts: fietsers en snorfietsers naast je?",
          "Laat rechtdoorgaand verkeer en overstekende voetgangers voor.",
          "Rustig de bocht door, kort rechts.",
        ],
      },
      {
        sleutel: "linksaf",
        titel: "Linksaf slaan",
        uitleg: "Linksaf kruis je tegemoetkomend verkeer. Wacht op een veilige ruimte en neem dan rustig de bocht.",
        stappen: [
          "Op tijd links voorsorteren en richting aangeven.",
          "Tegemoetkomend verkeer dat rechtdoor gaat, gaat voor.",
          "Wacht met recht gestuurde wielen, zodat je niet de tegenweg op geduwd wordt.",
          "Ruime bocht, let op overstekende fietsers en voetgangers.",
        ],
      },
      {
        sleutel: "rotondes",
        titel: "Rotondes",
        uitleg: "Op de meeste rotondes heeft het verkeer óp de rotonde voorrang. Kijk naar de haaientanden.",
        stappen: [
          "Snelheid omlaag, kijk links naar verkeer op de rotonde.",
          "Rijd rechts de rotonde op, zonder richting aan te geven.",
          "Geef richting aan naar rechts vlak voordat je eraf gaat.",
          "Let bij het afslaan op fietsers op het fietspad rond de rotonde.",
        ],
      },
      {
        sleutel: "verkeerslichten",
        titel: "Verkeerslichten",
        uitleg: "Groen betekent: je mag, als het veilig is. Bij geel stop je als dat nog veilig kan.",
        stappen: [
          "Kijk op tijd welk licht voor jouw rijstrook geldt.",
          "Geel: stoppen tenzij je te dichtbij bent om veilig te stoppen.",
          "Ook bij groen: let op afslaand verkeer en overstekers.",
          "Knipperend geel: de gewone voorrangsregels en borden gelden.",
        ],
      },
    ],
  },
  {
    sleutel: "verkeer",
    titel: "Meedoen in het verkeer",
    omschrijving: "Invoegen, inhalen, snelweg en rekening houden met anderen.",
    onderdelen: [
      {
        sleutel: "invoegen",
        titel: "Invoegen en uitvoegen",
        uitleg: "Op de invoegstrook breng je je snelheid op die van het verkeer en zoek je een gat.",
        stappen: [
          "Gebruik de hele invoegstrook om snelheid te maken.",
          "Spiegel en schouder links, richting aangeven.",
          "Voeg soepel in een gat; dwing niemand om te remmen.",
          "Uitvoegen: op tijd naar de rechterstrook, pas op de uitvoegstrook remmen.",
        ],
      },
      {
        sleutel: "inhalen",
        titel: "Inhalen",
        uitleg: "Inhalen doe je links, alleen als je het hele stuk kunt overzien en het mag.",
        stappen: [
          "Mag het hier? Geen doorgetrokken streep, geen inhaalverbod.",
          "Is er genoeg ruimte en zicht voor de hele inhaalactie?",
          "Spiegel, schouder, richting aangeven, dan pas uitwijken.",
          "Terug naar rechts als je de ingehaalde in je binnenspiegel ziet.",
        ],
      },
      {
        sleutel: "rijstrook-wisselen",
        titel: "Van rijstrook wisselen",
        uitleg: "Elke wissel is spiegel, schouder, richting aangeven en geleidelijk wisselen.",
        stappen: [
          "Kijk of er ruimte is, ook voor verkeer dat snel nadert.",
          "Richting aangeven en nog een keer de dode hoek checken.",
          "Geleidelijk wisselen, snelheid houden.",
          "Richtingaanwijzer uit als je er bent.",
        ],
      },
      {
        sleutel: "snelweg",
        titel: "Snelweg en autoweg",
        uitleg: "Op de snelweg rijd je rechts, behalve om in te halen. Let op matrixborden boven de weg.",
        stappen: [
          "Overdag geldt meestal 100 km/u; 's avonds kan meer, kijk naar de borden.",
          "Rood kruis boven een strook: die strook verlaten.",
          "Spitsstrook alleen gebruiken bij een groene pijl.",
          "Bij een file: ruim afstand en waarschuwingslichten als het plots stilvalt.",
        ],
      },
      {
        sleutel: "bijzondere-weggebruikers",
        titel: "Fietsers, voetgangers en bus",
        uitleg: "Kwetsbare verkeersdeelnemers verdienen ruimte en geduld. Verwacht het onverwachte.",
        stappen: [
          "Ruim afstand bij het passeren van fietsers.",
          "Voetgangers op een zebra laat je oversteken.",
          "Binnen de bebouwde kom laat je een bus die van de halte vertrekt gaan.",
          "Let extra op bij scholen, kinderen en ouderen.",
        ],
      },
      {
        sleutel: "buiten-bebouwde-kom",
        titel: "Buiten de bebouwde kom",
        uitleg: "Hogere snelheid, smallere wegen en landbouwverkeer: kijk verder vooruit en houd ruimte.",
        stappen: [
          "Meestal 80 km/u, soms 60: let op de borden.",
          "Snelheid omlaag voor onoverzichtelijke bochten.",
          "Langzaam verkeer alleen inhalen als je ver kunt kijken.",
          "Let op afslaand verkeer en erfuitritten.",
        ],
      },
    ],
  },
  {
    sleutel: "verrichtingen",
    titel: "Bijzondere verrichtingen",
    omschrijving: "Parkeren, keren en achteruitrijden: rustig, nauwkeurig en met goed kijken.",
    onderdelen: [
      {
        sleutel: "parkeren-vak",
        titel: "Parkeren in een vak",
        uitleg: "Langzaam is de sleutel: hoe trager de auto, hoe meer tijd om bij te sturen.",
        stappen: [
          "Kies het vak en geef richting aan.",
          "Stapvoets, met koppeling slepend of rustig kruipend.",
          "Kijk rondom: voetgangers en ander verkeer gaan voor.",
          "Recht in het vak, niet over de lijnen.",
        ],
      },
      {
        sleutel: "fileparkeren",
        titel: "Fileparkeren",
        uitleg: "Achteruit inparkeren tussen twee auto's in een paar vaste stappen.",
        stappen: [
          "Stop naast de voorste auto, ongeveer een halve meter ernaast.",
          "Achteruit rijden tot je achterwiel ter hoogte van zijn achterbumper is.",
          "Vol insturen en kijk rondom; als de auto schuin staat, terug sturen.",
          "Recht zetten met wat ruimte voor en achter.",
        ],
      },
      {
        sleutel: "keren",
        titel: "Keren",
        uitleg: "Keren doe je op een veilige plek, met zo min mogelijk hinder voor anderen.",
        stappen: [
          "Kies een plek met goed zicht naar beide kanten.",
          "Langzaam rijden, snel sturen.",
          "Voor elke richtingswisseling opnieuw rondom kijken.",
          "Gaat het niet in één keer? Rustig in drie bewegingen.",
        ],
      },
      {
        sleutel: "bocht-achteruit",
        titel: "Bocht achteruit",
        uitleg: "Je volgt de stoeprand achteruit door een zijstraat, langzaam en dicht langs de rand.",
        stappen: [
          "Stop voorbij de zijstraat, dicht langs de stoeprand.",
          "Langzaam achteruit, kijk vooral door de achterruit.",
          "Bij het begin van de bocht insturen, voor rondom kijken.",
          "Recht in de straat en een stukje doorrijden.",
        ],
      },
      {
        sleutel: "hellingproef",
        titel: "Hellingproef",
        uitleg: "Wegrijden op een helling zonder terug te rollen, met handrem of rem en koppeling.",
        stappen: [
          "Handrem aan, eerste versnelling.",
          "Gas en koppeling tot het aangrijpingspunt: de neus komt iets omhoog.",
          "Handrem los en rustig meer gas.",
          "Bij automaat: rem los en direct rustig gas.",
        ],
      },
      {
        sleutel: "noodstop",
        titel: "Noodstop",
        uitleg: "In nood rem je zo hard als kan in één beweging. ABS laat je sturen tijdens het remmen.",
        stappen: [
          "Rem en koppeling tegelijk vol in.",
          "Blijf vol remmen, ook als het pedaal trilt (ABS).",
          "Kijk en stuur waar je heen wilt.",
          "Na stilstand: waarschuwingslichten aan als het nodig is.",
        ],
      },
    ],
  },
  {
    sleutel: "examen",
    titel: "Zelfstandig en examen",
    omschrijving: "Zelf je weg vinden, zuinig rijden en klaar zijn voor het praktijkexamen.",
    onderdelen: [
      {
        sleutel: "zelfstandig-rijden",
        titel: "Zelfstandig een route rijden",
        uitleg: "Op het examen rijd je een stuk zelf naar een bestemming, via borden of een navigatie.",
        stappen: [
          "Lees de borden op tijd en kies op tijd je rijstrook.",
          "Navigatie is een hulp: het verkeer om je heen gaat voor.",
          "Verkeerd gereden? Rustig doorrijden en veilig omdraaien.",
          "Blijf letten op snelheid en kijkgedrag.",
        ],
      },
      {
        sleutel: "milieubewust",
        titel: "Zuinig rijden",
        uitleg: "Vooruitzien en vroeg schakelen bespaart brandstof en is ook veiliger.",
        stappen: [
          "Snel opschakelen en laag in toeren rijden.",
          "Gas los als je ziet dat je straks moet stoppen; de auto rolt zonder brandstof.",
          "Constante snelheid, geen onnodig optrekken en remmen.",
          "Bandenspanning goed en geen onnodige spullen in de auto.",
        ],
      },
      {
        sleutel: "gevaarherkenning",
        titel: "Gevaar zien aankomen",
        uitleg: "Een goede bestuurder ziet een situatie aankomen voordat die gevaarlijk wordt.",
        stappen: [
          "Vraag je steeds af: wat kan er hier gebeuren?",
          "Let op lichaamstaal: een fietser die omkijkt, een kind bij de stoep.",
          "Houd een uitwijkmogelijkheid en genoeg afstand.",
          "Twijfel? Snelheid omlaag.",
        ],
      },
      {
        sleutel: "examentraining",
        titel: "Examentraining",
        uitleg: "Een proefexamen laat zien waar je staat. Rijd zoals je altijd rijdt, rustig en duidelijk.",
        stappen: [
          "Voorbereiding: rijbewijsdocumenten en legitimatie geregeld.",
          "Vertel de examinator gerust als je iets niet verstaat.",
          "Een foutje? Gewoon doorgaan, het hele examen telt.",
          "Na afloop: bespreek de punten met je instructeur.",
        ],
      },
    ],
  },
];

const PER_SLEUTEL = new Map<string, { onderdeel: Onderdeel; fase: Fase }>(
  FASES.flatMap((fase) => fase.onderdelen.map((onderdeel) => [onderdeel.sleutel, { onderdeel, fase }] as const)),
);

export const ALLE_ONDERDELEN: Onderdeel[] = FASES.flatMap((f) => f.onderdelen);

export function onderdeelVan(sleutel: string): { onderdeel: Onderdeel; fase: Fase } | null {
  return PER_SLEUTEL.get(sleutel) ?? null;
}

export const isOnderdeel = (s: string) => PER_SLEUTEL.has(s);

export interface Beoordeling {
  score: number;
  notitie?: string;
}

export type Beoordelingen = Record<string, Beoordeling>;

/** Wat er in de database staat terug naar een geldige leskaart: onbekende onderdelen en scores vallen weg. */
export function leesBeoordelingen(json: unknown): Beoordelingen {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const uit: Beoordelingen = {};
  for (const [sleutel, waarde] of Object.entries(json as Record<string, unknown>)) {
    if (!isOnderdeel(sleutel) || !waarde || typeof waarde !== "object") continue;
    const { score, notitie } = waarde as { score?: unknown; notitie?: unknown };
    if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > 5) continue;
    uit[sleutel] = typeof notitie === "string" && notitie.trim() ? { score, notitie: notitie.trim().slice(0, 500) } : { score };
  }
  return uit;
}

export interface Stand {
  score: number;
  notitie?: string;
  /** ISO-moment van de les waarin dit het laatst is beoordeeld */
  at: string;
}

export interface Voortgang {
  /** de laatste beoordeling per onderdeel */
  stand: Record<string, Stand>;
  /** 0–100: hoe ver de leerling is, gemeten tegen examenniveau op alle onderdelen */
  procent: number;
  perFase: { sleutel: string; titel: string; procent: number }[];
  /** alle onderdelen minstens zelfstandig (4) */
  examenklaar: boolean;
  /** onderdelen om aan te werken: al beoordeeld en nog onder zelfstandig, laagste eerst */
  aandacht: string[];
}

/** De voortgang uit de beoordelingen van alle lessen; de laatste beoordeling per onderdeel telt. */
export function voortgang(lessen: { at: string | Date; beoordeling: unknown }[]): Voortgang {
  const stand: Record<string, Stand> = {};
  const opVolgorde = lessen
    .map((l) => ({ at: new Date(l.at).toISOString(), b: leesBeoordelingen(l.beoordeling) }))
    .sort((a, b) => a.at.localeCompare(b.at));
  for (const les of opVolgorde) {
    for (const [sleutel, b] of Object.entries(les.b)) stand[sleutel] = { ...b, at: les.at };
  }
  const procentVan = (onderdelen: Onderdeel[]) =>
    onderdelen.length === 0 ? 0 : Math.round((onderdelen.reduce((s, o) => s + (stand[o.sleutel]?.score ?? 0), 0) / (onderdelen.length * 5)) * 100);
  const aandacht = Object.entries(stand)
    .filter(([, s]) => s.score < 4)
    .sort((a, b) => a[1].score - b[1].score || a[0].localeCompare(b[0]))
    .map(([k]) => k);
  return {
    stand,
    procent: procentVan(ALLE_ONDERDELEN),
    perFase: FASES.map((f) => ({ sleutel: f.sleutel, titel: f.titel, procent: procentVan(f.onderdelen) })),
    examenklaar: ALLE_ONDERDELEN.every((o) => (stand[o.sleutel]?.score ?? 0) >= 4),
    aandacht,
  };
}
