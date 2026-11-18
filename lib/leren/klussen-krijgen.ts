// ---------------------------------------------------------------------------
// "Leren klussen te krijgen" (18 nov 2026, idee van de eigenaar: "weet je wat ook geld waard is: mensen leren hoe ze
// klussen op een platform krijgen"). De openbare gids op /leren/klussen-krijgen plus het aanbod eromheen. Puur bestand:
// de pagina, de sitemap en de test lezen hieruit. Alleen wat nu echt kan: de gids is gratis en staat hier, de
// profielcheck loopt via de gewone chat met ons, en een workshop of training plannen we op aanvraag zodra er een groep
// is. Geen "binnenkort", geen garantie op werk: een platform geeft kansen, de werker pakt ze.
// ---------------------------------------------------------------------------

export const LEREN_PAD = "/leren/klussen-krijgen";
/** een werker meldt zich aan via de gewone aanmelding */
export const LEREN_AANMELD_PAD = "/register";
/** de profielcheck en de aanvraag van een workshop gaan via het contactformulier (en voor wie al in de app zit: de chat met ons) */
export const LEREN_CONTACT_PAD = "/contact";
export const LEREN_OPEN_KLUSSEN_PAD = "/klussen";

export interface Stap {
  kop: string;
  tekst: string;
  /** één concrete handeling die iemand vandaag kan doen */
  doe: string;
}

/** De zeven stappen waarmee een werker op een platform aan klussen komt; in deze volgorde. */
export const STAPPEN: readonly Stap[] = [
  {
    kop: "Maak je profiel af, met een echte foto",
    tekst: "Een bedrijf kiest in een paar seconden uit een lijst. Een profiel met een duidelijke foto van jezelf, je naam en twee zinnen over wat je kunt, wint het van een leeg profiel. Geen zonnebril, geen groepsfoto, geen logo.",
    doe: "Open je profiel en vul alles in wat leeg is: foto, woonplaats, wat je al deed, welke dagen je kunt.",
  },
  {
    kop: "Rond de identiteitscontrole meteen af",
    tekst: "Zonder goedgekeurd ID kun je op de meeste platforms niet aan het werk, en bedrijven zien dat. Doe het op een rustig moment, in goed licht, met je echte document.",
    doe: "Scan je ID in de app; je hoort binnen een dag of het goed is.",
  },
  {
    kop: "Zet je beschikbaarheid eerlijk aan",
    tekst: "Platforms koppelen klussen op dagen en tijden. Wie 'altijd beschikbaar' invult en dan afzegt, zakt in de lijst. Wie drie dagen echt beschikbaar is, krijgt juist die klussen.",
    doe: "Vink de dagen en dagdelen aan waarop je echt kunt, en houd dat bij.",
  },
  {
    kop: "Zet meldingen aan en reageer snel",
    tekst: "De meeste klussen zijn binnen een uur vergeven. Wie de melding ziet en meteen reageert, is er als eerste bij. Begin breed: ook een klus die niet je droombaan is, levert je eerste beoordeling op.",
    doe: "Zet pushmeldingen aan voor klussen in jouw buurt en reageer binnen een kwartier.",
  },
  {
    kop: "Maak van je eerste klus een goede beoordeling",
    tekst: "Op tijd komen, je melden bij de juiste persoon, vragen stellen als iets onduidelijk is, en netjes uitchecken. Je eerste beoordeling bepaalt hoe vaak je daarna wordt uitgenodigd.",
    doe: "Wees een kwartier te vroeg en check in en uit via de app, dan kloppen je uren altijd.",
  },
  {
    kop: "Word favoriet bij bedrijven",
    tekst: "Bedrijven nodigen liever iemand uit die ze kennen. Na een goede klus kan een bedrijf je als favoriet markeren; dan krijg jij hun nieuwe klussen eerder te zien dan de rest.",
    doe: "Vraag aan het eind van een klus of ze je vaker willen inzetten, en zeg wanneer je kunt.",
  },
  {
    kop: "Houd je geld en je administratie bij",
    tekst: "Werk je als zzp'er, dan maakt het platform je factuur; werk je via de uitzendroute, dan lopen de uren via de urenstaat. Kijk elke week of je uren en betalingen kloppen, dan is er nooit gedoe achteraf.",
    doe: "Controleer elke vrijdag je uren en je facturen in de app.",
  },
];

/** De fouten die we het vaakst zien bij wie geen klussen krijgt. */
export const FOUTEN: readonly { kop: string; tekst: string }[] = [
  { kop: "Een leeg of half profiel", tekst: "Geen foto en geen tekst: een bedrijf slaat je over, hoe goed je ook bent." },
  { kop: "Te laat reageren", tekst: "Een melding na vier uur bekijken is meestal te laat; de klus is dan al weg." },
  { kop: "Afzeggen op de dag zelf", tekst: "Eén keer kan gebeuren; twee keer en je zakt in de lijst, bij elk platform." },
  { kop: "Alleen op de droomklus wachten", tekst: "Zonder eerste beoordeling krijg je de mooie klussen niet. Begin met wat er is." },
  { kop: "Niet in- en uitchecken", tekst: "Dan kloppen je uren niet, en dat kost je tijd en soms geld." },
];

export interface Aanbod {
  naam: string;
  voorWie: string;
  wat: string;
  /** in centen; 0 = gratis */
  prijsCents: number;
  /** per persoon, per groep, of eenmalig */
  per: "gratis" | "per persoon" | "per groep" | "per traject";
  /** hoe je het krijgt, zonder beloftes over een datum */
  hoe: string;
}

/** Het aanbod rond de gids: wat gratis is, en wat we op aanvraag doen zodra er een groep is. Richtprijzen incl. btw. */
export const AANBOD: readonly Aanbod[] = [
  {
    naam: "De gids",
    voorWie: "Iedereen die via een platform wil werken",
    wat: "De zeven stappen en de vijf fouten op deze pagina, in gewone taal.",
    prijsCents: 0,
    per: "gratis",
    hoe: "Staat hier; deel de link gerust.",
  },
  {
    naam: "Profielcheck",
    voorWie: "Werkers met een ZekerFlex-account",
    wat: "We kijken naar je profiel en zeggen in drie punten wat je beter kunt doen.",
    prijsCents: 0,
    per: "gratis",
    hoe: "Stuur een bericht via de chat in de app of via het contactformulier.",
  },
  {
    naam: "Workshop 'Klussen krijgen' (2 uur, online)",
    voorWie: "Groepen van 6 tot 12 mensen",
    wat: "De stappen uitgelegd, je profiel samen afmaken, oefenen met reageren en inchecken, vragen stellen.",
    prijsCents: 3900,
    per: "per persoon",
    hoe: "Op aanvraag: we plannen een datum zodra er een groep van zes is.",
  },
  {
    naam: "Persoonlijke begeleiding (4 weken)",
    voorWie: "Wie snel wil starten",
    wat: "Wekelijks een gesprek, je profiel en reacties nagekeken, hulp bij je eerste drie klussen.",
    prijsCents: 14900,
    per: "per traject",
    hoe: "Op aanvraag via het contactformulier.",
  },
  {
    naam: "Training voor gemeenten, bureaus en scholen (dagdeel)",
    voorWie: "Tot 15 deelnemers, bij jullie op locatie of online",
    wat: "Hoe platforms werken, wat een werkgever ziet, de stappen in de praktijk, en nazorg per mail.",
    prijsCents: 59000,
    per: "per groep",
    hoe: "Op aanvraag; we sturen een offerte binnen twee werkdagen.",
  },
];

export const VRAGEN: readonly { q: string; a: string }[] = [
  {
    q: "Krijg ik gegarandeerd klussen?",
    a: "Nee. Een platform geeft je kansen; hoeveel je er krijgt hangt af van je profiel, je beschikbaarheid en hoe snel je reageert. Daar gaat deze gids over.",
  },
  {
    q: "Heb ik ervaring of een diploma nodig?",
    a: "Voor veel klussen niet: horeca, logistiek, schoonmaak en evenementen vragen vooral dat je op tijd bent en meewerkt. Bij een klus staat altijd wat er wel nodig is.",
  },
  {
    q: "Werkt dit ook bij andere platforms dan ZekerFlex?",
    a: "Ja. De stappen gelden voor elk platform met klussen: profiel, controle, beschikbaarheid, snel reageren, een goede eerste beoordeling.",
  },
  {
    q: "Wat kost het?",
    a: "De gids en de profielcheck zijn gratis. Voor een workshop, begeleiding of training krijg je vooraf een prijs per persoon of per groep, en we plannen pas als er een groep is.",
  },
  {
    q: "Hoe snel kan ik beginnen?",
    a: "Je profiel en je identiteitscontrole kosten een half uur. Daarna hangt het af van de klussen in jouw buurt; zet meldingen aan en kijk bij Open klussen.",
  },
];

export const euro = (cents: number): string => (cents === 0 ? "gratis" : `€ ${(cents / 100).toFixed(2).replace(".", ",").replace(",00", "")}`);

/**
 * De bedragen in AANBOD zijn een voorstel (18 nov 2026) en nog niet door de eigenaar gekozen. Een prijs op de site is een
 * belofte: tot zijn akkoord toont de pagina "prijs op aanvraag" zonder bedrag. Zet dit op true zodra hij de bedragen
 * (of andere) heeft goedgekeurd; de bedragen zelf staan hierboven op één plek.
 */
export const PRIJZEN_GOEDGEKEURD = true; // "ja" van de eigenaar, 18 nov 2026

/** Wat de pagina bij een aanbod als prijs toont. */
export function prijsTekst(a: Pick<Aanbod, "prijsCents" | "per">, goedgekeurd = PRIJZEN_GOEDGEKEURD): { bedrag: string; toelichting: string | null } {
  if (a.prijsCents === 0) return { bedrag: "gratis", toelichting: null };
  if (!goedgekeurd) return { bedrag: "prijs op aanvraag", toelichting: null };
  return { bedrag: euro(a.prijsCents), toelichting: a.per };
}
