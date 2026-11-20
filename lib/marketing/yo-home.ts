// ---------------------------------------------------------------------------
// De openbare site in de opzet van de website van YoungOnes (20 nov 2026, eigenaar: "dezelfde website-weergave als
// YoungOnes: de standaardpagina voor werkers en die voor bedrijven, alle functies en weergave overnemen, alleen onze
// eigen foto's"). Hier staan de teksten van de nieuwe blokken; de pagina's (app/(marketing)/page.tsx en
// /bedrijven) zijn alleen opmaak. Eigen woorden, dezelfde opbouw: kop in kapitalen, drie vinkjes, twee knoppen,
// een blok met foto en nachtblauw vlak, een genummerde lijst, tabbladen, de community en een fotostrook.
// Puur en browser-veilig; alles is waar en nu te doen.
// ---------------------------------------------------------------------------

export interface YoTab {
  label: string;
  titel: string;
  tekst: string;
  foto: string;
  alt: string;
  knop: { label: string; href: string };
  knop2?: { label: string; href: string };
}

/** Een kaart in "Ontmoet de werkers" / "Zo werkt het bij bedrijven". */
export interface YoKaart {
  kop: string;
  tekst: string;
  foto: string;
  alt: string;
}

// --- werkers (de voorpagina) --------------------------------------------------

export const YO_WERK = {
  kop: "Maak er werk van.",
  /** de video- en fotokaarten naast de kop: onze eigen werkers (campagnefoto's), geen verzonnen namen */
  kaarten: [
    { foto: "/werk/campagne-studie.jpg", alt: "Een barista schenkt melk in een cappuccino", label: "Werken naast je studie" },
    { foto: "/werk/campagne-zzp.jpg", alt: "Een magazijnmedewerker scant een doos", label: "Werken als zzp'er" },
  ],
  kaartLabel: "Werkers aan het woord",
  knop2: "Hoe werkt het?",
  split: {
    kop: "Wij maken werk anders.",
    tekst:
      "Jij bepaalt wanneer je werkt, waar en voor welk tarief. Geen vast rooster, wel de regie. Je ziet vooraf wat je verdient, je checkt in met je telefoon en je geld komt op je eigen rekening. Werk dat past bij jouw leven, niet andersom.",
    slot: "Maak er werk van.",
    foto: "/werk/campagne-extra.jpg",
    alt: "Een barman tapt een biertje achter de bar",
    knop2: { label: "Zo werkt het", href: "#hoe-het-werkt" },
  },
  genummerd: {
    kop: "Werk, op jouw manier",
  },
  tabs: {
    kop: "Eén plek voor al het werk",
    items: [
      {
        label: "Eén plek voor al het werk",
        titel: "Eén plek voor al het werk",
        tekst: "Of je nu in het weekend wilt werken of doordeweeks, overdag of 's avonds, een avond per week of elke dag: de klussen staan op één plek. Horeca, magazijn, winkel, evenementen, schoonmaak en meer, bij jou in de buurt.",
        foto: "/shifts/campagne-horeca.jpg",
        alt: "Een medewerker in de bediening van een restaurant",
        knop: { label: "Maak gratis je profiel", href: "/register?type=freelancer" },
        knop2: { label: "Zo werkt het", href: "#hoe-het-werkt" },
      },
      {
        label: "Zzp en freelance",
        titel: "Werken als zzp'er of freelancer",
        tekst: "Met een KVK-nummer werk je voor jezelf. Je bepaalt je eigen tarief, kiest je eigen klussen en hoeft zelf geen facturen te sturen: die maken wij voor je. Je kiest zelf hoe snel je uitbetaald wordt.",
        foto: "/werk/campagne-zzp.jpg",
        alt: "Een magazijnmedewerker scant een doos",
        knop: { label: "Start als zzp'er", href: "/register?type=freelancer" },
        knop2: { label: "Veelgestelde vragen", href: "#vragen" },
      },
      {
        label: "Uitzendwerk",
        titel: "Werken als uitzendkracht",
        tekst: "Geen KVK? Dan werk je via ons uitzendbureau, met elke week een echte loonstrook, vakantiegeld en pensioen. Je kiest nog steeds zelf welke klussen je doet.",
        foto: "/werk/campagne-uitzend.jpg",
        alt: "Een medewerker duwt een steekkar met dozen",
        knop: { label: "Start als uitzendkracht", href: "/register?type=freelancer" },
        knop2: { label: "Veelgestelde vragen", href: "#vragen" },
      },
    ] satisfies YoTab[],
    vragen: {
      kop: "Vragen?",
      tekst: "Onze chat staat voor je klaar, ook 's avonds en in het weekend.",
      foto: "/werk/campagne-studie.jpg",
      knop: { label: "Start chat", href: "/contact" },
      knop2: { label: "Bekijk de vragen", href: "#vragen" },
    },
  },
  community: {
    kop: "Ontmoet de werkers",
    tekst: "Studenten, zzp'ers, uitzendkrachten en mensen die er iets bij doen: zo werken zij via ZekerFlex.",
    knop2: { label: "Bekijk de app", href: "/voorbeeld" },
  },
  strook: {
    krabbel: "Ga ervoor",
    fotos: [
      { foto: "/shifts/campagne-logistiek.jpg", alt: "Een magazijnmedewerker tussen de stellingen" },
      { foto: "/shifts/campagne-retail.jpg", alt: "Een winkelmedewerker vult een schap" },
      { foto: "/shifts/campagne-evenement.jpg", alt: "Een medewerker op een evenement" },
    ],
  },
} as const;

// --- bedrijven ------------------------------------------------------------------

export const YO_BEDRIJF = {
  kop: "Mensen nodig? Morgen geregeld.",
  lead: "De één heeft hulp nodig, de ander komt helpen. Zo simpel is het. Plaats een klus en werk morgen samen met geverifieerde mensen bij jou in de buurt. Zonder gedoe, zonder verrassingen.",
  punten: ["Geverifieerde mensen", "Alleen betalen voor gewerkte uren", "Snel, makkelijk, flexibel"],
  knop: { label: "Plaats een klus", href: "/klus-plaatsen" },
  knop2: { label: "Bekijk tarieven", href: "/prijzen" },
  foto: "/marketing/employer-branch.jpg",
  alt: "Een ondernemer in haar zaak, klaar om personeel in te plannen",
  krabbel: "Maak er werk van",
  drie: [
    { kop: "Geen gedoe.", tekst: "Geen lange inwerktrajecten, stapels cv's en eindeloos rondbellen. Je plaatst een klus in drie stappen en ziet meteen wie kan." },
    { kop: "Geen verrassingen.", tekst: "Je ziet vooraf het uurtarief en wat de klus kost. Je betaalt alleen de uren die je zelf goedkeurt, de factuur komt vanzelf." },
    { kop: "Geen losse eindjes.", tekst: "Inchecken, uren, facturen en de chat met je mensen: alles staat in één omgeving. Favorieten plan je met één tik opnieuw in." },
  ],
  tabs: {
    kop: "Eén platform voor werk",
    items: [
      {
        label: "Eén platform voor werk",
        titel: "Eén platform voor werk",
        tekst: "Van zzp'ers tot uitzendkrachten en van horeca tot logistiek: één plek voor al je flexibele mensen. Zet je klus op ZekerFlex als je versterking nodig hebt, vandaag of volgende maand.",
        foto: "/shifts/campagne-horeca.jpg",
        alt: "Een medewerker in de bediening van een restaurant",
        knop: { label: "Plaats een klus", href: "/klus-plaatsen" },
        knop2: { label: "Hoe het werkt", href: "#hoe-het-werkt" },
      },
      {
        label: "Zzp'ers",
        titel: "Werken met zzp'ers",
        tekst: "Zelfstandigen met een KVK-nummer, geverifieerd met hun ID. Jij kiest wie je boekt, op basis van opkomst, beoordelingen en eerdere klussen. De facturen maken wij.",
        foto: "/werk/campagne-zzp.jpg",
        alt: "Een magazijnmedewerker scant een doos",
        knop: { label: "Plaats een klus", href: "/klus-plaatsen" },
        knop2: { label: "Bekijk tarieven", href: "/prijzen" },
      },
      {
        label: "Uitzendkrachten",
        titel: "Werken met uitzendkrachten",
        tekst: "Liever iemand in loondienst? Via ons uitzendbureau is ZekerFlex de werkgever: wij verlonen elke week, jij houdt de regie over wie er komt en wanneer.",
        foto: "/werk/campagne-uitzend.jpg",
        alt: "Een medewerker duwt een steekkar met dozen",
        knop: { label: "Plaats een klus", href: "/klus-plaatsen" },
        knop2: { label: "Bekijk tarieven", href: "/prijzen" },
      },
    ] satisfies YoTab[],
  },
  split: {
    kop: "Werk kan beter.",
    intro: "Wij zeggen: genoeg.",
    tekst:
      "Niet omdat we dwars willen zijn, maar omdat we zien wat er gebeurt als bedrijven stoppen met zoeken en beginnen met verbinden. Als mensen zelf kiezen voor jouw klus, komen ze ook. Zo had werk altijd al moeten zijn.",
    slot: "Maak er werk van. Samen maken we werk eerlijker.",
    foto: "/shifts/campagne-horeca.jpg",
    alt: "Een medewerker in de bediening van een restaurant",
    knop: { label: "Over ons", href: "/over-ons" },
    knop2: { label: "Plaats een klus", href: "/klus-plaatsen" },
  },
} as const;
