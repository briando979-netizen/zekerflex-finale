// Studio → Webshop → Groei: wat GET/POST /api/werkgever/sites/groei teruggeeft (het scherm:
// components/studio/Groei.tsx). Los en puur, zodat het scherm het type kan delen.

/** Hoe het product van een wachtlijst ervoor staat: te bestellen (dan kunnen de mails), uitverkocht, verborgen of uit de winkel. */
export type WachtToestand = "te-bestellen" | "uitverkocht" | "verborgen" | "weg";

export interface GroeiStand {
  gepubliceerd: boolean;
  eigenDomein: boolean;
  /** waar de webshop staat, zonder slash aan het eind */
  adres: string;
  /** de productfeed voor Google (lib/sites/productfeed.ts); url null zolang er geen is */
  feed: { url: string | null; inFeed: number; zonderFoto: number; zonderPrijs: number };
  /** "mail me als het er weer is": alleen aantallen per product, nooit een adres */
  wachtlijst: { productId: string; naam: string; aantal: number; toestand: WachtToestand }[];
}
