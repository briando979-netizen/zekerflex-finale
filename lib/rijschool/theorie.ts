// ---------------------------------------------------------------------------
// Theorie oefenen in de leerling-app: een eigen vragenbank van ZekerFlex,
// geschreven vanuit de verkeersregels (RVV 1990), met uitleg bij elk
// antwoord. Geen vragen van het CBR en geen vervanging van een officiële
// theoriecursus; wel een snelle manier om de regels te herhalen. Het goede
// antwoord staat in de bank altijd vooraan; `ronde` schudt de keuzes.
// Puur en client-veilig.
// ---------------------------------------------------------------------------

export const THEORIE_ONDERDELEN = [
  { sleutel: "voorrang", titel: "Voorrang en kruispunten" },
  { sleutel: "snelheid", titel: "Snelheid, afstand en remweg" },
  { sleutel: "regels", titel: "Borden, strepen en lichten" },
  { sleutel: "veilig", titel: "Veilig en verantwoord rijden" },
] as const;

export type TheorieOnderdeel = (typeof THEORIE_ONDERDELEN)[number]["sleutel"];

interface BankVraag {
  id: string;
  onderdeel: TheorieOnderdeel;
  vraag: string;
  goed: string;
  fout: string[];
  uitleg: string;
}

export interface TheorieVraag {
  id: string;
  onderdeel: TheorieOnderdeel;
  vraag: string;
  opties: string[];
  /** index van het goede antwoord in `opties` */
  goed: number;
  uitleg: string;
}

const BANK: BankVraag[] = [
  // --- voorrang ---------------------------------------------------------------
  { id: "v1", onderdeel: "voorrang", vraag: "Je nadert een kruispunt zonder borden, haaientanden of verkeerslichten. Van rechts komt een fietser. Wie gaat voor?", goed: "De fietser", fout: ["Jij, want je rijdt in een auto", "Wie het eerst bij het kruispunt is"], uitleg: "Op een gelijkwaardig kruispunt gaat verkeer van rechts voor, ook fietsers." },
  { id: "v2", onderdeel: "voorrang", vraag: "Wat betekenen haaientanden op het wegdek voor jou?", goed: "Je moet voorrang verlenen", fout: ["Je hebt voorrang", "Je mag hier niet stoppen"], uitleg: "Haaientanden (witte driehoeken met de punt naar jou toe) betekenen: voorrang verlenen aan het verkeer op de weg die je nadert." },
  { id: "v3", onderdeel: "voorrang", vraag: "Op een gelijkwaardig kruispunt komt van links een tram. Wie gaat voor?", goed: "De tram", fout: ["Jij, want je komt van rechts", "Wie het hardst rijdt"], uitleg: "Een tram gaat op een gelijkwaardig kruispunt altijd voor, ook als hij van links komt." },
  { id: "v4", onderdeel: "voorrang", vraag: "Je rijdt een uitrit uit, over een verlaagde stoeprand de weg op. Wie heeft voorrang?", goed: "Al het verkeer op de weg en de stoep", fout: ["Alleen verkeer van rechts", "Jij, want je rijdt al"], uitleg: "Wie een uitrit verlaat, geeft al het verkeer voorrang: ook voetgangers en fietsers." },
  { id: "v5", onderdeel: "voorrang", vraag: "Je slaat rechtsaf. Op het fietspad rechts naast je rijdt een fietser rechtdoor. Wat doe je?", goed: "De fietser voor laten gaan", fout: ["Doorrijden, want je hebt richting aangegeven", "Toeteren zodat de fietser stopt"], uitleg: "Afslaand verkeer laat rechtdoorgaand verkeer op dezelfde weg voorgaan, ook fietsers op een fietspad." },
  { id: "v6", onderdeel: "voorrang", vraag: "Je slaat bij groen licht linksaf. Een tegenligger gaat rechtdoor. Wie gaat voor?", goed: "De tegenligger", fout: ["Jij, want jouw licht is groen", "Wie het eerst optrekt"], uitleg: "Ook bij groen gaat tegemoetkomend verkeer dat rechtdoor gaat voor op afslaand verkeer." },
  { id: "v7", onderdeel: "voorrang", vraag: "Een voetganger staat bij een zebrapad en wil duidelijk oversteken. Wat doe je?", goed: "Stoppen en de voetganger laten oversteken", fout: ["Doorrijden, de voetganger wacht wel", "Toeteren en snelheid houden"], uitleg: "Voetgangers die op een zebrapad oversteken of duidelijk willen oversteken, laat je voorgaan." },
  { id: "v8", onderdeel: "voorrang", vraag: "Binnen de bebouwde kom geeft een lijnbus aan dat hij van de halte wil wegrijden. Wat doe je?", goed: "De bus laten wegrijden", fout: ["Snel erlangs voordat hij vertrekt", "Lichtsignaal geven dat hij moet wachten"], uitleg: "Binnen de bebouwde kom geef je een lijnbus die richting aangeeft om van een halte weg te rijden de ruimte." },
  { id: "v9", onderdeel: "voorrang", vraag: "Een ambulance met blauw zwaailicht en sirene nadert van achteren. Wat doe je?", goed: "Zo snel als veilig kan ruimte maken", fout: ["Gewoon doorrijden op je eigen snelheid", "Meteen midden op de weg stoppen"], uitleg: "Voorrangsvoertuigen met blauw licht en sirene geef je ruim baan, maar wel op een veilige manier." },
  { id: "v10", onderdeel: "voorrang", vraag: "Bij de ingangen van een rotonde staan haaientanden. Wie gaat voor?", goed: "Het verkeer dat al op de rotonde rijdt", fout: ["Het verkeer dat de rotonde op wil", "Altijd verkeer van rechts"], uitleg: "Met haaientanden bij de ingang heeft het verkeer op de rotonde voorrang. Dat is op de meeste rotondes zo." },
  // --- snelheid ---------------------------------------------------------------
  { id: "s1", onderdeel: "snelheid", vraag: "Wat is de maximumsnelheid voor een auto binnen de bebouwde kom als er geen borden staan?", goed: "50 km/u", fout: ["30 km/u", "60 km/u"], uitleg: "Binnen de bebouwde kom geldt 50 km/u, tenzij borden iets anders aangeven, zoals in een 30 km-zone." },
  { id: "s2", onderdeel: "snelheid", vraag: "Wat is de maximumsnelheid buiten de bebouwde kom op een gewone weg zonder borden?", goed: "80 km/u", fout: ["100 km/u", "60 km/u"], uitleg: "Buiten de bebouwde kom geldt 80 km/u en op een autoweg 100 km/u. Borden kunnen een lagere snelheid aangeven." },
  { id: "s3", onderdeel: "snelheid", vraag: "Hoe hard mag je overdag (6.00 tot 19.00 uur) maximaal op de snelweg?", goed: "100 km/u", fout: ["120 km/u", "130 km/u"], uitleg: "Overdag geldt op de snelweg 100 km/u. 's Avonds en 's nachts mag het op sommige stukken sneller, alleen als de borden dat aangeven." },
  { id: "s4", onderdeel: "snelheid", vraag: "Hoe hard mag je in een erf (woonerf)?", goed: "Stapvoets", fout: ["30 km/u", "50 km/u als het rustig is"], uitleg: "In een erf rijd je stapvoets: voetgangers en spelende kinderen gebruiken de hele weg." },
  { id: "s5", onderdeel: "snelheid", vraag: "Hoeveel afstand houd je minstens tot je voorganger op een droge weg?", goed: "Twee seconden", fout: ["Een halve seconde", "Altijd precies tien meter"], uitleg: "Twee seconden is het minimum op een droge weg. Bij regen of gladheid neem je het dubbele of meer." },
  { id: "s6", onderdeel: "snelheid", vraag: "Hoeveel meter leg je ongeveer af in één seconde bij 50 km/u?", goed: "Ongeveer 14 meter", fout: ["Ongeveer 5 meter", "Ongeveer 50 meter"], uitleg: "50 km/u is bijna 14 meter per seconde. Eén seconde op je telefoon kijken is dus 14 meter blind rijden." },
  { id: "s7", onderdeel: "snelheid", vraag: "Wat gebeurt er met je remweg als je twee keer zo hard rijdt?", goed: "Hij wordt ongeveer vier keer zo lang", fout: ["Hij wordt twee keer zo lang", "Hij blijft gelijk"], uitleg: "De remweg groeit met het kwadraat van de snelheid: twee keer zo hard is ongeveer vier keer zo'n lange remweg." },
  { id: "s8", onderdeel: "snelheid", vraag: "Het regent hard. Wat doe je?", goed: "Snelheid omlaag en meer afstand houden", fout: ["Snelheid houden en dichter achter je voorganger rijden", "Alleen je mistachterlicht aanzetten"], uitleg: "Op een nat wegdek is je remweg langer en zie je minder: rustiger rijden en meer afstand." },
  { id: "s9", onderdeel: "snelheid", vraag: "Waar begint de bebouwde kom?", goed: "Bij het blauwe bord met de plaatsnaam", fout: ["Bij het eerste huis", "Bij het eerste 30 km-bord"], uitleg: "De bebouwde kom begint bij het blauwe plaatsnaambord en eindigt bij hetzelfde bord met een rode streep." },
  { id: "s10", onderdeel: "snelheid", vraag: "Wat geldt in een 30 km-zone?", goed: "Je mag niet harder dan 30 km/u", fout: ["30 km/u is een advies, 50 mag ook", "30 km/u geldt alleen voor vrachtwagens"], uitleg: "Het zonebord geeft een echte maximumsnelheid aan die geldt tot het einde van de zone." },
  // --- regels -----------------------------------------------------------------
  { id: "r1", onderdeel: "regels", vraag: "Wat betekent een rond bord met een rode rand en een helemaal wit vlak?", goed: "Gesloten voor voertuigen, in beide richtingen", fout: ["Einde van alle verboden", "Parkeerverbod"], uitleg: "Een rond wit bord met rode rand betekent: gesloten voor alle voertuigen, in beide richtingen." },
  { id: "r2", onderdeel: "regels", vraag: "Wat betekent een achthoekig rood bord met STOP?", goed: "Altijd stoppen en voorrang verlenen", fout: ["Alleen stoppen als er verkeer aankomt", "Hier mag je niet parkeren"], uitleg: "Bij een stopbord stop je altijd, ook als de weg vrij lijkt, en verleen je voorrang." },
  { id: "r3", onderdeel: "regels", vraag: "Wat betekent een geel ruitvormig bord met een witte rand?", goed: "Je rijdt op een voorrangsweg", fout: ["Einde voorrangsweg", "Gevaarlijke bocht"], uitleg: "De gele ruit betekent: voorrangsweg. Met een zwarte streep erdoor is het het einde van de voorrangsweg." },
  { id: "r4", onderdeel: "regels", vraag: "Mag je een doorgetrokken streep overschrijden om in te halen?", goed: "Nee", fout: ["Ja, als er geen tegenligger is", "Ja, maar alleen buiten de bebouwde kom"], uitleg: "Een doorgetrokken streep mag je niet overschrijden. Inhalen kan daar dus niet." },
  { id: "r5", onderdeel: "regels", vraag: "Wat betekent een rood kruis boven een rijstrook van de snelweg?", goed: "Deze rijstrook niet gebruiken", fout: ["Maximaal 100 km/u", "Einde van de spitsstrook over een kilometer"], uitleg: "Een rood kruis betekent dat de rijstrook dicht is. Je mag er niet (meer) rijden; voeg op tijd en veilig in." },
  { id: "r6", onderdeel: "regels", vraag: "Wanneer mag je een spitsstrook gebruiken?", goed: "Als er een groene pijl boven de strook staat", fout: ["Altijd tijdens de spits", "Alleen bij pech"], uitleg: "Een spitsstrook is alleen open als de groene pijl brandt." },
  { id: "r7", onderdeel: "regels", vraag: "Wat betekent een gele doorgetrokken streep langs de rand van de weg?", goed: "Je mag daar niet stilstaan", fout: ["Parkeren mag alleen met een vergunning", "Fietsers mogen er niet rijden"], uitleg: "Een gele doorgetrokken streep is een stopverbod. Een gele onderbroken streep is een parkeerverbod." },
  { id: "r8", onderdeel: "regels", vraag: "Hoe dicht bij een kruispunt mag je parkeren?", goed: "Niet binnen 5 meter van het kruispunt", fout: ["Niet binnen 1 meter", "Overal, als de stoep vrij blijft"], uitleg: "Binnen 5 meter van een kruispunt parkeer je niet: je ontneemt anderen dan het zicht." },
  { id: "r9", onderdeel: "regels", vraag: "Het licht springt op geel terwijl je er zo dichtbij bent dat je niet meer veilig kunt stoppen. Wat doe je?", goed: "Rustig doorrijden", fout: ["Vol in de remmen", "Optrekken om het nog te halen"], uitleg: "Geel betekent stoppen als dat veilig kan. Lukt dat niet meer, dan rijd je rustig door." },
  { id: "r10", onderdeel: "regels", vraag: "Wanneer gebruik je het mistachterlicht?", goed: "Bij zicht van minder dan 50 meter door mist of sneeuw", fout: ["Bij elke regenbui", "Altijd in het donker"], uitleg: "Het mistachterlicht is alleen voor heel slecht zicht door mist of sneeuwval. Anders verblind je je achterligger." },
  { id: "r11", onderdeel: "regels", vraag: "Een verkeerslicht knippert geel. Wat betekent dat?", goed: "Pas op: de gewone voorrangsregels en borden gelden", fout: ["Stoppen", "Jij hebt altijd voorrang"], uitleg: "Knipperend geel is een waarschuwing. Het licht regelt niets: borden en de gewone regels gelden." },
  // --- veilig -----------------------------------------------------------------
  { id: "g1", onderdeel: "veilig", vraag: "Hoeveel alcohol mag een beginnende bestuurder maximaal in het bloed hebben?", goed: "0,2 promille", fout: ["0,5 promille", "0,8 promille"], uitleg: "Voor beginnende bestuurders geldt 0,2 promille, voor ervaren bestuurders 0,5. In de praktijk: niet drinken als je rijdt." },
  { id: "g2", onderdeel: "veilig", vraag: "Mag je je telefoon vasthouden terwijl je voor een rood verkeerslicht wacht?", goed: "Nee", fout: ["Ja, de auto staat stil", "Ja, maar alleen om te bellen"], uitleg: "Een telefoon vasthouden mag niet zolang je aan het verkeer deelneemt, ook niet als je stilstaat voor een verkeerslicht of in de file." },
  { id: "g3", onderdeel: "veilig", vraag: "Wie moet in een auto de gordel dragen?", goed: "Iedereen, voor en achter", fout: ["Alleen de bestuurder", "Alleen wie voorin zit"], uitleg: "Iedereen in de auto draagt de gordel, ook achterin." },
  { id: "g4", onderdeel: "veilig", vraag: "Een kind is kleiner dan 1,35 meter. Hoe vervoer je het?", goed: "In een goedgekeurd kinderzitje of op een zittingverhoger", fout: ["Gewoon met de gordel", "Op schoot achterin"], uitleg: "Kinderen kleiner dan 1,35 meter gaan in een goedgekeurd kinderbeveiligingsmiddel dat past bij hun lengte en gewicht." },
  { id: "g5", onderdeel: "veilig", vraag: "Wat is het wettelijke minimum voor het profiel van een autoband?", goed: "1,6 millimeter", fout: ["0,5 millimeter", "4 millimeter"], uitleg: "Wettelijk minimaal 1,6 mm. Voor goed remmen op een nat wegdek is meer profiel veel veiliger." },
  { id: "g6", onderdeel: "veilig", vraag: "Je merkt tijdens een lange rit dat je moe wordt. Wat is het beste?", goed: "Een pauze nemen op een veilige plek", fout: ["Het raam openen en doorrijden", "Harder rijden om eerder thuis te zijn"], uitleg: "Moeheid gaat niet weg met frisse lucht of muziek. Stop en rust uit; neem bij lange ritten ongeveer elke twee uur pauze." },
  { id: "g7", onderdeel: "veilig", vraag: "Wanneer gebruik je je grootlicht niet?", goed: "Als je tegenliggers of voorgangers kunt verblinden", fout: ["Buiten de bebouwde kom", "Op een onverlichte weg"], uitleg: "Grootlicht is handig op donkere wegen, maar zet het op tijd uit voor tegenliggers en voorgangers." },
  { id: "g8", onderdeel: "veilig", vraag: "Op de snelweg valt het verkeer voor je plotseling stil. Hoe waarschuw je achterliggers?", goed: "Kort je waarschuwingsknipperlichten aanzetten", fout: ["Grootlicht aanzetten", "Toeteren"], uitleg: "Met de alarmlichten waarschuw je achteropkomend verkeer voor de plotselinge file. Zet ze weer uit als zij je gezien hebben." },
  { id: "g9", onderdeel: "veilig", vraag: "Je krijgt pech op de snelweg. Wat doe je?", goed: "Zo ver mogelijk naar rechts, alarmlichten aan en achter de vangrail gaan staan", fout: ["In de auto blijven zitten met de radio aan", "Over de vluchtstrook naar het volgende tankstation lopen"], uitleg: "Zet de auto zo ver mogelijk rechts, zet de alarmlichten aan, stap aan de veilige kant uit en wacht achter de vangrail op hulp." },
];

export const AANTAL_VRAGEN = BANK.length;

const schud = <T,>(lijst: T[], random: () => number): T[] => {
  const uit = [...lijst];
  for (let i = uit.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [uit[i], uit[j]] = [uit[j] as T, uit[i] as T];
  }
  return uit;
};

/** Een oefenronde: `aantal` vragen uit één onderdeel of uit alles ("mix"), met geschudde keuzes. */
export function ronde(onderdeel: TheorieOnderdeel | "mix", aantal: number, random: () => number = Math.random): TheorieVraag[] {
  const pool = onderdeel === "mix" ? BANK : BANK.filter((v) => v.onderdeel === onderdeel);
  return schud(pool, random)
    .slice(0, aantal)
    .map((v) => {
      const opties = schud([v.goed, ...v.fout], random);
      return { id: v.id, onderdeel: v.onderdeel, vraag: v.vraag, opties, goed: opties.indexOf(v.goed), uitleg: v.uitleg };
    });
}

export const isTheorieOnderdeel = (s: string): s is TheorieOnderdeel => THEORIE_ONDERDELEN.some((o) => o.sleutel === s);

export interface TheorieScore {
  goed: number;
  totaal: number;
  at: string;
}

/** De beste ronde per onderdeel (en "mix"), zoals bewaard op de leerling. */
export function leesTheorie(json: unknown): Record<string, TheorieScore> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const uit: Record<string, TheorieScore> = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (k !== "mix" && !isTheorieOnderdeel(k)) continue;
    const { goed, totaal, at } = (v ?? {}) as Record<string, unknown>;
    if (typeof goed === "number" && typeof totaal === "number" && typeof at === "string" && totaal > 0 && goed >= 0 && goed <= totaal) {
      uit[k] = { goed, totaal, at };
    }
  }
  return uit;
}

/** Bewaar een nieuwe ronde als die beter is dan de vorige (of de eerste is). */
export function bewaarBeste(huidig: Record<string, TheorieScore>, onderdeel: string, ronde: TheorieScore): Record<string, TheorieScore> {
  const oud = huidig[onderdeel];
  const beter = !oud || ronde.goed / ronde.totaal > oud.goed / oud.totaal || (ronde.goed / ronde.totaal === oud.goed / oud.totaal && ronde.totaal > oud.totaal);
  return beter ? { ...huidig, [onderdeel]: ronde } : huidig;
}
