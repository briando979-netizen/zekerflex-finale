// De koppenletter van de webshop en de websitevoorstellen: Instrument Serif, de
// schreefzus van Instrument Sans (de tekstletter van de hele site). Zelf gehost
// zoals lib/fonts.ts (regels in app/fonts.css); alleen app/shop en
// app/websitevoorstel zetten de variabele en laden de bestanden voor, dus de rest
// van de site haalt ze niet op.

/** Zet --font-serif (app/fonts.css). */
export const fontSerif = { variable: "zf-font-serif" } as const;

export const SERIF_PRELOADS = [
  "/fonts/instrument-serif-latin.60c06664.woff2",
  "/fonts/instrument-serif-latin-ext.a8c4bd7c.woff2",
  "/fonts/instrument-serif-italic-latin.6ee678c3.woff2",
  "/fonts/instrument-serif-italic-latin-ext.a04fc7ed.woff2",
] as const;
