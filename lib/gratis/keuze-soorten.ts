// ---------------------------------------------------------------------------
// De soorten en de teksten van de keuze per dienst: puur, zonder kv, env of
// prisma, zodat een client-component dit mag inlezen. De stand zelf en het
// lezen/schrijven staan in lib/gratis/keuzes.ts (alleen server).
// ---------------------------------------------------------------------------

export type Bron = "eigen" | "betaald" | "auto";

export const BRONNEN = ["eigen", "betaald", "auto"] as const;

export const KEUZE_DIENSTEN = ["reistijd", "sales-bedrijven", "review-bedrijven", "stem"] as const;
export type KeuzeDienst = (typeof KEUZE_DIENSTEN)[number];

export const BRON_LABEL: Record<Bron, string> = {
  eigen: "Van ons zelf",
  betaald: "Betaalde dienst",
  auto: "Automatisch",
};

export const BRON_UITLEG: Record<Bron, string> = {
  eigen: "altijd onze eigen bron — kost gegarandeerd niets",
  betaald: "eerst de betaalde dienst, onze eigen bron als die wegvalt",
  auto: "onze eigen bron zodra 'alles gratis' aanstaat of de sleutel ontbreekt",
};

export interface KeuzeUitleg {
  id: KeuzeDienst;
  naam: string;
  /** wat er verandert als je "eigen" kiest, eerlijk ook als dat minder is */
  gevolg: string;
}

export const KEUZE_UITLEG: KeuzeUitleg[] = [
  {
    id: "reistijd",
    naam: "Reistijd en afstand",
    gevolg:
      "Eigen: wij rekenen het zelf uit (zo'n 10 tot 20% naast Google, ruim genoeg om op reisafstand te matchen) en er gaat geen adres naar buiten.",
  },
  {
    id: "sales-bedrijven",
    naam: "Bedrijven zoeken voor de buitendienst",
    gevolg:
      "Eigen: OpenStreetMap geeft naam, adres, telefoon en website. Minder bedrijven dan Google, maar wat erin staat klopt en kost niets.",
  },
  {
    id: "review-bedrijven",
    naam: "Bedrijf opzoeken voor de review-scan",
    gevolg:
      "Let op: de sterren en het aantal beoordelingen staan alléén bij Google. Zet je dit op eigen, dan werkt de review-scan nog wel, maar zonder cijfer.",
  },
  {
    id: "stem",
    naam: "Tekst naar spraak",
    gevolg:
      "Eigen: Piper op onze eigen server, een Nederlandse stem die niets per keer kost. Draait sinds 6 november; 'automatisch' zou hier nog naar Google gaan.",
  },
];

/**
 * De standaard per dienst. Eigen waar dat niets kost aan kwaliteit, betaald
 * waar het product er echt op leunt (de review-scan verkoopt juist het
 * Google-cijfer), automatisch waar onze eigen kant nog niet draait.
 */
export const STANDAARD_KEUZE: Record<KeuzeDienst, Bron> = {
  reistijd: "eigen",
  "sales-bedrijven": "eigen",
  "review-bedrijven": "betaald",
  stem: "auto",
};
