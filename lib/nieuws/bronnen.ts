// De openbare bronnen van de nieuwsroom (lib/nieuws/regels.ts). Alleen officiële instanties met een eigen feed, gratis en
// zonder sleutel. Een bron erbij = een regel hier plus de host in lib/gratis/diensten.ts (tests/gratis-dekking.test.ts).
// De Rijksoverheid heeft sinds de nieuwe site geen vaste nieuwsfeed meer (18 nov 2026 nagekeken): die staat er dus niet bij.
// Wetgeving komt uit de internetconsultaties: wetsvoorstellen en besluiten die de overheid openbaar voorlegt.

export interface NieuwsBron {
  id: string;
  naam: string;
  feed: string;
  /** alleen links die hiermee beginnen zijn berichten (een feed bevat soms ook tabellen, podcasts en eigen nieuws) */
  alleenPad: string;
  /** hoe we de bron mogen gebruiken, voor onder het bericht */
  licentie: string;
  /**
   * "nieuws": een gewoon nieuwsbericht met een datum in de feed.
   * "consultatie": een wetsvoorstel dat ter consultatie ligt; de feed heeft geen datum, die staat op de pagina zelf
   * (Startdatum en Status), en het bericht hoort altijd in de rubriek Wet en regels.
   */
  soort: "nieuws" | "consultatie";
}

export const NIEUWS_BRONNEN: NieuwsBron[] = [
  {
    id: "cbs",
    naam: "CBS",
    feed: "https://www.cbs.nl/nl-nl/rss-feeds/alle-nieuwsberichten",
    alleenPad: "https://www.cbs.nl/nl-nl/nieuws/",
    licentie: "Bron: CBS (CC BY 4.0)",
    soort: "nieuws",
  },
  {
    id: "consultatie",
    naam: "Overheid.nl, internetconsultatie",
    feed: "https://www.internetconsultatie.nl/rss/feed",
    alleenPad: "https://www.internetconsultatie.nl/",
    licentie: "Bron: Overheid.nl, internetconsultatie (openbare overheidsinformatie)",
    soort: "consultatie",
  },
];

export const bronMetId = (id: string) => NIEUWS_BRONNEN.find((b) => b.id === id) ?? null;
