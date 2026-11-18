// ---------------------------------------------------------------------------
// "Zo krijg je als bedrijf goede mensen via een platform" (18 nov 2026): de tegenhanger van de werkersgids
// (lib/leren/klussen-krijgen.ts), op /leren/personeel-krijgen. Puur bestand. Alleen wat nu echt kan: de gids is
// gratis en staat hier, de klus-check loopt via het contactformulier of de chat, en een snelstart of training plannen
// we op aanvraag. Geen "binnenkort", geen belofte dat elke klus gevuld wordt, en niets over een verzekering (die is er niet).
// ---------------------------------------------------------------------------
import { BASE_FEE_PER_HOUR_CENTS } from "@/lib/pricing/tiers";
import { euro, prijsTekst, type Aanbod, type Stap } from "@/lib/leren/klussen-krijgen";

export const LEREN_BEDRIJF_PAD = "/leren/personeel-krijgen";
export const LEREN_BEDRIJF_AANMELD_PAD = "/register?type=bedrijf";
export const LEREN_BEDRIJF_KLUS_PAD = "/klus-plaatsen";
export const LEREN_BEDRIJF_CONTACT_PAD = "/contact";

/** De platformfee zoals de site hem noemt, uit één bron (lib/pricing/tiers.ts). */
export const FEE_TEKST = euro(BASE_FEE_PER_HOUR_CENTS);

export const STAPPEN_BEDRIJF: readonly Stap[] = [
  {
    kop: "Schrijf de klus zoals je hem aan een nieuwe collega uitlegt",
    tekst: "Wat ga je doen, waar meld je je, hoe laat begint het echt, wat trek je aan, wie is je aanspreekpunt. Een klus van drie regels krijgt de helft minder aanmeldingen dan een klus die dit allemaal zegt.",
    doe: "Zet in elke klus: adres, begintijd, kleding, aanspreekpunt met voornaam, en één zin over wat het werk inhoudt.",
  },
  {
    kop: "Betaal een eerlijk tarief en wees er open over",
    tekst: `Werkers zien het uurtarief en vergelijken. Een paar euro boven het minimum levert meer en betere aanmeldingen op dan een lage prijs. Wat het platform rekent (${FEE_TEKST} per gewerkt uur) staat er los van, zodat niemand verrast wordt.`,
    doe: "Kijk wat vergelijkbare klussen in jouw stad betalen en ga daar niet onder zitten.",
  },
  {
    kop: "Plaats op tijd",
    tekst: "De meeste werkers plannen een paar dagen vooruit. Een klus die twee dagen van tevoren staat, vult beter dan een klus voor vanavond. Moet het toch vandaag, gebruik dan de spoedoproep: die stuurt een melding naar iedereen in de buurt die vrij is.",
    doe: "Plaats vaste klussen minstens twee dagen vooraf; houd de spoedoproep voor echte uitval.",
  },
  {
    kop: "Reageer binnen een uur op aanmeldingen",
    tekst: "Goede mensen melden zich op meerdere klussen tegelijk aan. Wie het eerst bevestigt, heeft ze. Een aanmelding die een dag blijft liggen, is meestal al ergens anders terecht.",
    doe: "Zet de meldingen voor aanmeldingen aan en bevestig dezelfde dag, liefst binnen een uur.",
  },
  {
    kop: "Ontvang iemand goed",
    tekst: "Een vast aanspreekpunt, inchecken bij aankomst en vijf minuten uitleg. Dat is het verschil tussen iemand die eenmalig komt en iemand die terugkomt. Werkers beoordelen bedrijven ook, en andere werkers lezen dat.",
    doe: "Spreek af wie de werker opvangt en laat die persoon bij de start vijf minuten vrijmaken.",
  },
  {
    kop: "Beoordeel na afloop en maak favorieten",
    tekst: "Een beoordeling kost een minuut en helpt de goede werkers omhoog. Wie goed was, markeer je als favoriet: die ziet jouw volgende klussen eerder dan de rest, en zo bouw je een vaste groep op zonder contracten.",
    doe: "Beoordeel elke klus dezelfde dag en zet de beste twee mensen op favoriet.",
  },
  {
    kop: "Keur uren dezelfde week goed",
    tekst: "Werkers kiezen bedrijven waar het geld op tijd komt. Uren die blijven liggen, zijn de snelste manier om goede mensen kwijt te raken. Goedgekeurde uren worden vanzelf een factuur, dus het kost je niets extra.",
    doe: "Keur uren elke vrijdag goed; stel vragen over een urenstaat dezelfde dag, niet een week later.",
  },
];

export const FOUTEN_BEDRIJF: readonly { kop: string; tekst: string }[] = [
  { kop: "Een vage klus", tekst: "Zonder adres, tijd en aanspreekpunt melden alleen de wanhopigen zich aan." },
  { kop: "Te laat plaatsen", tekst: "Een klus voor over twee uur vult zelden, en als hij vult is het geluk." },
  { kop: "Niet reageren", tekst: "Een aanmelding die blijft liggen is weg; de werker heeft al ja gezegd tegen een ander." },
  { kop: "Geen aanspreekpunt", tekst: "Iemand die bij aankomst niemand kent, komt niet terug." },
  { kop: "Uren laten liggen", tekst: "Niet goedgekeurde uren is niet betaald; dat gaat rond onder werkers." },
];

/** Het aanbod voor bedrijven; de bedragen zijn een voorstel tot de eigenaar ze goedkeurt (PRIJZEN_BEDRIJF_GOEDGEKEURD). */
export const AANBOD_BEDRIJF: readonly Aanbod[] = [
  {
    naam: "De gids",
    voorWie: "Elk bedrijf dat via een platform mensen wil",
    wat: "De zeven stappen en de vijf fouten op deze pagina.",
    prijsCents: 0,
    per: "gratis",
    hoe: "Staat hier; deel de link met wie bij jullie klussen plaatst.",
  },
  {
    naam: "Klus-check",
    voorWie: "Bedrijven met een ZekerFlex-account",
    wat: "We lezen je eerste klus mee en zeggen in drie punten wat beter kan voordat hij online gaat.",
    prijsCents: 0,
    per: "gratis",
    hoe: "Via het contactformulier of de chat in je werkgeversomgeving.",
  },
  {
    naam: "Snelstart (1 uur, online)",
    voorWie: "Eén bedrijf, met wie de klussen plaatst",
    wat: "We zetten samen je eerste drie klussen erop, stellen meldingen in en lopen het goedkeuren van uren door.",
    prijsCents: 9900,
    per: "per traject",
    hoe: "Op aanvraag via het contactformulier.",
  },
  {
    naam: "Training voor een team, keten of franchise (dagdeel)",
    voorWie: "Tot 15 planners of vestigingsmanagers",
    wat: "Hoe werkers kiezen, wat een goede klus is, snel reageren, vaste mensen opbouwen, uren en facturen; met nazorg per mail.",
    prijsCents: 59000,
    per: "per groep",
    hoe: "Op aanvraag; we sturen een offerte binnen twee werkdagen.",
  },
];

export const VRAGEN_BEDRIJF: readonly { q: string; a: string }[] = [
  {
    q: "Wordt elke klus gevuld?",
    a: "Nee. Hoe goed een klus vult hangt af van het tarief, hoe duidelijk hij is, hoe ver vooruit hij staat en hoeveel werkers er in jouw buurt zijn. Daar gaat deze gids over.",
  },
  {
    q: "Wat kost het?",
    a: `Een klus plaatsen is gratis. Je betaalt per gewerkt uur een platformfee van ${FEE_TEKST} (lager bij meer uren per maand) bovenop het tarief van de werker. Een snelstart of training heeft een eigen prijs; die hoor je vooraf.`,
  },
  {
    q: "Zzp'er of uitzendkracht?",
    a: "Beide kan. Een zzp'er factureert via het platform; een uitzendkracht werkt via de uitzendroute met een urenstaat. Bij het plaatsen kies je wat bij de klus past.",
  },
  {
    q: "Wat als iemand niet komt opdagen?",
    a: "Een afzegging of niet-verschijnen telt tegen de werker en je kunt meteen een spoedoproep sturen naar wie in de buurt vrij is. Een garantie dat er altijd iemand komt, geven we niet.",
  },
  {
    q: "Hoe snel kan ik beginnen?",
    a: "Een account en je eerste klus kosten een kwartier. Plaats de klus minstens twee dagen vooruit, dan heb je de beste kans.",
  },
];

/** Een prijs op de site is een belofte; tot het akkoord van de eigenaar toont de pagina "prijs op aanvraag". */
export const PRIJZEN_BEDRIJF_GOEDGEKEURD = false;
export const prijsTekstBedrijf = (a: Pick<Aanbod, "prijsCents" | "per">) => prijsTekst(a, PRIJZEN_BEDRIJF_GOEDGEKEURD);
