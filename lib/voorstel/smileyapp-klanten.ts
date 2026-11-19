import { KLANTEN, QUOTES } from "@/lib/voorstel/smileyapp";

// ---------------------------------------------------------------------------
// De klantverhalen van het SmileyApp-voorstel (19 nov 2026): de twee quotes van
// smileyapp.nl, uitgewerkt tot een verhaal. Er staat niets in wat niet in de
// quote zelf of in hun lijst met klanten (KLANTEN) staat: geen resultaten, geen
// cijfers, geen omschrijving van de organisatie van buitenaf. "Wat ze meten" en
// "hoe het eerst ging" zijn de woorden uit de quote, alleen op een rij gezet.
// Puur bestand.
// ---------------------------------------------------------------------------

export interface Verhaal {
  /** anker op de pagina */
  id: string;
  organisatie: string;
  naam: string;
  beeld: string;
  /** de volledige quote, letterlijk */
  quote: readonly string[];
  /** wat uit de quote blijkt over waar ze Smileyapp voor gebruiken */
  gebruik: string;
  /** hoe het eerst ging; alleen als de quote dat zegt */
  eerst?: string;
  /** wat ze meten, in de woorden van de quote */
  meten: readonly string[];
  /** het logo en de link uit de lijst met klanten, als de organisatie daarin staat */
  klant?: (typeof KLANTEN)[number];
}

const metKlant = (naam: string) => {
  const k = KLANTEN.find((x) => x.naam === naam);
  return k ? { klant: k } : {};
};
const [hanze, alfa] = QUOTES;

export const VERHALEN: readonly Verhaal[] = [
  {
    id: "hanzehogeschool",
    organisatie: hanze.organisatie,
    naam: hanze.naam,
    beeld: hanze.beeld,
    quote: hanze.tekst,
    gebruik: "De Hanzehogeschool laat studenten met Smileyapp hun minor en vakken beoordelen.",
    eerst: "Elke student kreeg de vraag om een evaluatieformulier in te vullen via Word.",
    meten: ["Hoe de studenten de minor hebben ervaren", "Hoe de studenten verschillende vakken hebben ervaren"],
    ...metKlant("Hanzehogeschool"),
  },
  {
    id: "alfa-college",
    organisatie: alfa.organisatie,
    naam: alfa.naam,
    beeld: alfa.beeld,
    quote: alfa.tekst,
    gebruik: "Het Alfa College gebruikt Smileyapp onder andere bij stagemarkten en bij externe activiteiten die het organiseert met het bedrijfsleven.",
    meten: ["Stagemarkten", "Trainingen en workshops", "Praktijkopdrachten", "Bedrijfsbezoeken", "Voorlichting"],
    ...metKlant("Alfa College"),
  },
];
