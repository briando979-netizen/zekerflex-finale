import type { OntwerpGegevens } from "@/lib/advertentie/ontwerp";
import type { OntwerpNr } from "@/lib/advertentie/regels";

// De voorbeeldadvertenties op /advertentie-op-maat: VERZONNEN bedrijven, alleen om te laten zien hoe een advertentie
// eruit kan zien. Op de pagina staat bij elk het label "voorbeeld". Geen prijzen, kortingen of claims. Puur bestand.

export interface Voorbeeld {
  sleutel: string;
  ontwerp: OntwerpNr;
  gegevens: OntwerpGegevens;
  /** voor de alt-tekst */
  soort: string;
}

export const VOORBEELDEN: Voorbeeld[] = [
  {
    sleutel: "bakker",
    ontwerp: 2,
    soort: "een bakkerij",
    gegevens: { bedrijf: "Bakkerij De Korenbloem", kop: "Vers brood, elke ochtend", onderregel: "Brood, gebak en belegde broodjes uit eigen oven.", knop: "Kom langs", plaats: "Voorbeeldstad", contact: "Dorpsstraat 1", kleur: "#E8590C" },
  },
  {
    sleutel: "fietsen",
    ontwerp: 1,
    soort: "een fietsenmaker",
    gegevens: { bedrijf: "Fietsenmaker Van Dijk", kop: "Je fiets weer als nieuw", onderregel: "Reparatie en onderhoud van stadsfietsen en e-bikes.", knop: "Maak een afspraak", plaats: "Voorbeeldstad", contact: "fietsenmaker.example", kleur: "#0E5C4A" },
  },
  {
    sleutel: "kapper",
    ontwerp: 3,
    soort: "een kapsalon",
    gegevens: { bedrijf: "Kapsalon Noor", kop: "Nu ook open op zondag", onderregel: "Knippen, kleuren en föhnen voor dames en heren.", knop: "Boek je afspraak", plaats: "Voorbeeldstad", contact: "kapsalonnoor.example", kleur: "#5B3A9B" },
  },
  {
    sleutel: "sportschool",
    ontwerp: 4,
    soort: "een sportschool",
    gegevens: { bedrijf: "Sportschool Noord", kop: "Train op jouw manier", onderregel: "Kracht, conditie en groepslessen onder één dak.", knop: "Kom kijken", plaats: "Voorbeeldstad", contact: "sportschoolnoord.example", kleur: "#B3261E", teken: "barbell" },
  },
  {
    sleutel: "bloemist",
    ontwerp: 5,
    soort: "een bloemist",
    gegevens: { bedrijf: "Bloemen van Lot", kop: "Verse boeketten, elke dag", onderregel: "Bloemen en planten voor thuis en om te geven.", knop: "Kies je boeket", plaats: "Voorbeeldstad", contact: "bloemenvanlot.example", kleur: "#1D4E89", teken: "flower-tulip" },
  },
  {
    sleutel: "boekhandel",
    ontwerp: 6,
    soort: "een boekhandel",
    gegevens: { bedrijf: "Boekhandel Pagina", kop: "Een goed boek begint hier", onderregel: "Romans, kinderboeken en cadeaus, met persoonlijk advies.", knop: "Loop binnen", plaats: "Voorbeeldstad", contact: "boekhandelpagina.example", kleur: "#0E5C4A" },
  },
];

export const voorbeeldVan = (sleutel: string): Voorbeeld | undefined => VOORBEELDEN.find((v) => v.sleutel === sleutel);
