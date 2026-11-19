import { BASE, QUOTES, VRAAGSOORTEN } from "@/lib/voorstel/smileyapp";

// ---------------------------------------------------------------------------
// Een pagina per branche voor het SmileyApp-voorstel (19 nov 2026). Op
// smileyapp.nl staat alleen dát Smileyapp voor alle branches inzetbaar is; wat
// hier per branche staat, is een algemene inleiding (zonder cijfers of
// beloftes), de momenten waarop je zou kunnen meten, en een VOORBEELD van een
// vragenlijst. Dat voorbeeld is van ZekerFlex, niet van een echte klant, en zo
// heet het ook op de pagina. De soorten vragen komen uit VRAAGSOORTEN (wat
// Smileyapp volgens hun eigen site kan); bij onderwijs staan de twee echte
// quotes van hun site, letterlijk. Puur bestand.
// ---------------------------------------------------------------------------

/** De vier soorten vragen van smileyapp.nl, met een kort etiket voor op de pagina. */
export type Vraagsoort = (typeof VRAAGSOORTEN)[number];
export const SOORT_LABEL: Record<Vraagsoort, string> = {
  "1-10 rating vragen": "1-10 rating",
  "open vragen": "Open vraag",
  "ja/nee vragen": "Ja/nee",
  "een leeg tekstveld om feedback en gegevens te vragen": "Leeg tekstveld",
};

export interface VoorbeeldVraag {
  soort: Vraagsoort;
  tekst: string;
}

export interface Branche {
  slug: string;
  naam: string;
  /** de kop van de pagina */
  kop: string;
  /** algemene inleiding, zonder cijfers of beloftes */
  intro: readonly string[];
  /** momenten waarop je kunt meten */
  momenten: readonly string[];
  /** precies vijf voorbeeldvragen */
  vragen: readonly VoorbeeldVraag[];
  /** de score van de smiley op de kaart (alleen versiering) */
  smiley: number;
}

const RATING = VRAAGSOORTEN[0];
const OPEN = VRAAGSOORTEN[1];
const JANEE = VRAAGSOORTEN[2];
const TEKSTVELD = VRAAGSOORTEN[3];

export const VOORBEELD_LABEL = "Voorbeeld, in je eigen dashboard pas je alles aan";

export const BRANCHES: Record<string, Branche> = {
  horeca: {
    slug: "horeca",
    naam: "Horeca",
    kop: "Gastvrijheid meten in de horeca",
    intro: [
      "Een gast die aan tafel zegt dat alles naar wens was, vertelt niet altijd wat hij echt vond. Met een korte vragenlijst op de eigen telefoon geeft een gast zijn mening op het moment zelf.",
      "Je zet een QR-code op tafel, op de rekening of bij de uitgang. De gast scant, swipet de smiley en is zo klaar.",
    ],
    momenten: ["Aan tafel, na het hoofdgerecht", "Bij het afrekenen", "Bij de uitgang of de garderobe", "Na het afhalen of bezorgen, met een QR-code op de verpakking"],
    vragen: [
      { soort: RATING, tekst: "Hoe tevreden ben je over je bezoek van vandaag?" },
      { soort: RATING, tekst: "Wat vond je van het eten en drinken?" },
      { soort: RATING, tekst: "Hoe gastvrij vond je onze bediening?" },
      { soort: JANEE, tekst: "Zou je ons aanraden aan vrienden of familie?" },
      { soort: OPEN, tekst: "Wat kunnen we de volgende keer beter doen?" },
    ],
    smiley: 10,
  },
  onderwijs: {
    slug: "onderwijs",
    naam: "Onderwijs",
    kop: "Studenten en deelnemers laten beoordelen",
    intro: [
      "Een evaluatie na een vak, een minor of een activiteit levert meer op als studenten hem meteen en zonder gedoe invullen. Een smiley swipen kost een paar seconden.",
      "Je hangt de QR-code in het lokaal of zet hem op de laatste dia. Zo kan de hele groep meedoen, niet alleen wie na afloop blijft hangen.",
    ],
    momenten: ["Aan het eind van een les, vak of minor", "Na een stagemarkt of open dag", "Na een workshop, training of bedrijfsbezoek", "Na een voorlichting"],
    vragen: [
      { soort: RATING, tekst: "Hoe heb je dit vak ervaren?" },
      { soort: RATING, tekst: "Hoe duidelijk was de uitleg?" },
      { soort: JANEE, tekst: "Sloot de inhoud aan bij wat je verwachtte?" },
      { soort: OPEN, tekst: "Wat moeten we zeker zo houden?" },
      { soort: TEKSTVELD, tekst: "Wil je nog iets kwijt of wil je dat we contact met je opnemen? Laat het hier achter." },
    ],
    smiley: 9,
  },
  zorg: {
    slug: "zorg",
    naam: "Zorg",
    kop: "Ervaringen van cliënten en bezoekers ophalen",
    intro: [
      "Wie net bij een behandelaar of aan de balie is geweest, weet nog precies hoe dat ging. Een korte vragenlijst in de wachtkamer of bij de uitgang vraagt ernaar op dat moment.",
      "Houd de vragen algemeen en vraag niet naar medische gegevens: het gaat om de ervaring, niet om het dossier.",
    ],
    momenten: ["In de wachtkamer, na de afspraak", "Bij de balie of de uitgang", "Na een behandeltraject", "Na een bezoek aan huis, met een QR-code op een kaartje"],
    vragen: [
      { soort: RATING, tekst: "Hoe tevreden ben je over je afspraak van vandaag?" },
      { soort: RATING, tekst: "Hoe vriendelijk ben je ontvangen?" },
      { soort: JANEE, tekst: "Was de uitleg die je kreeg duidelijk?" },
      { soort: JANEE, tekst: "Werd je op tijd geholpen?" },
      { soort: OPEN, tekst: "Wat zou je bezoek prettiger hebben gemaakt?" },
    ],
    smiley: 9,
  },
  winkel: {
    slug: "winkel",
    naam: "Winkel en retail",
    kop: "Weten wat klanten van je winkel vinden",
    intro: [
      "Een klant die de winkel uitloopt, vertelt zelden waarom hij wel of niet iets kocht. Met een QR-code bij de kassa of op de bon vraag je het op het moment dat hij het nog weet.",
      "De QR-code kun je ook meegeven in het pakket van een online bestelling.",
    ],
    momenten: ["Bij de kassa, na het afrekenen", "Op de kassabon of de tas", "Bij de paskamer of de servicebalie", "In het pakket van een online bestelling"],
    vragen: [
      { soort: RATING, tekst: "Hoe tevreden ben je over je bezoek aan onze winkel?" },
      { soort: RATING, tekst: "Hoe goed ben je geholpen door onze medewerkers?" },
      { soort: JANEE, tekst: "Heb je gevonden wat je zocht?" },
      { soort: OPEN, tekst: "Wat miste je in ons assortiment?" },
      { soort: TEKSTVELD, tekst: "Wil je een reactie van ons? Laat dan hier je gegevens achter." },
    ],
    smiley: 10,
  },
  evenementen: {
    slug: "evenementen",
    naam: "Evenementen",
    kop: "Feedback van bezoekers, nog tijdens je event",
    intro: [
      "Na een evenement is iedereen weer naar huis en komt een enquête per mail vaak niet meer aan. Met een QR-code op het terrein, op een scherm of op het polsbandje vraag je het terwijl bezoekers er nog zijn.",
      "Voor een (meerdaags) evenement of meerdere locaties is er het Maatwerk Pakket, dat je zelf samenstelt.",
    ],
    momenten: ["Bij de uitgang", "Na een optreden, sessie of spreker", "Bij de bar of het eetplein", "Aan het eind van elke dag bij een meerdaags evenement"],
    vragen: [
      { soort: RATING, tekst: "Hoe tevreden ben je over het evenement?" },
      { soort: RATING, tekst: "Wat vond je van het programma?" },
      { soort: RATING, tekst: "Hoe vond je de organisatie op het terrein?" },
      { soort: JANEE, tekst: "Kom je de volgende keer weer?" },
      { soort: OPEN, tekst: "Wat mag er volgend jaar niet ontbreken?" },
    ],
    smiley: 10,
  },
};

export const BRANCHE_LIJST: readonly Branche[] = Object.values(BRANCHES);

/** De branche bij een slug uit de adresbalk; een onbekende slug (ook "constructor") bestaat niet. */
export function branche(slug: string): Branche | undefined {
  return Object.hasOwn(BRANCHES, slug) ? BRANCHES[slug] : undefined;
}

export const brancheLink = (slug: string) => `${BASE}/branches/${slug}`;

/** De echte quotes van smileyapp.nl die bij een branche horen (alleen onderwijs: beide zijn van een school). */
export function quotesVoor(slug: string): readonly (typeof QUOTES)[number][] {
  return slug === "onderwijs" ? QUOTES : [];
}
