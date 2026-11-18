// De openbare bronnen van de nieuwsroom (lib/nieuws/regels.ts). Alleen officiële instanties met een eigen feed, gratis en
// zonder sleutel. Een bron erbij = een regel hier plus de host in lib/gratis/diensten.ts (tests/gratis-dekking.test.ts).
// De Rijksoverheid heeft sinds de nieuwe site geen vaste nieuwsfeed meer (18 nov 2026 nagekeken): die staat er dus niet bij.

export interface NieuwsBron {
  id: string;
  naam: string;
  feed: string;
  /** alleen links die hiermee beginnen zijn nieuwsberichten (de feed bevat ook tabellen, podcasts en eigen nieuws) */
  alleenPad: string;
  /** hoe we de bron mogen gebruiken, voor onder het bericht */
  licentie: string;
}

export const NIEUWS_BRONNEN: NieuwsBron[] = [
  {
    id: "cbs",
    naam: "CBS",
    feed: "https://www.cbs.nl/nl-nl/rss-feeds/alle-nieuwsberichten",
    alleenPad: "https://www.cbs.nl/nl-nl/nieuws/",
    licentie: "Bron: CBS (CC BY 4.0)",
  },
];

export const bronMetId = (id: string) => NIEUWS_BRONNEN.find((b) => b.id === id) ?? null;
