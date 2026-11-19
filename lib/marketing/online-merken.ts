// ---------------------------------------------------------------------------
// Het eigen merkteken van elke online tool op /online (19 nov 2026, eigenaar:
// "geen een heeft een mooi eigen logo"). Per tool een eigen kleurverloop en een
// eigen vorm, getekend als SVG-paden op een raster van 24 bij 24 (lijn 2, ronde
// uiteinden). Puur bestand: de test leest hem, components/marketing/online/ToolMerk.tsx tekent hem.
// ---------------------------------------------------------------------------

export interface Merk {
  /** begin- en eindkleur van het verloop op de tegel */
  van: string;
  naar: string;
  /** SVG-paden (d) in het 24×24-raster, wit, lijn 2 */
  paden: string[];
  /** gevulde vormen (cirkels, punten) als [cx, cy, r] */
  punten?: [number, number, number][];
}

export const MERKEN: Record<string, Merk> = {
  // maken
  website: { van: "#0E5C4A", naar: "#4FE0A0", paden: ["M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18Z", "M3 12h18", "M12 3c-3 3-3 15 0 18", "M12 3c3 3 3 15 0 18"] },
  webshop: { van: "#B7791F", naar: "#F5C451", paden: ["M5 8h14l-1 12H6L5 8Z", "M9 8V6a3 3 0 0 1 6 0v2"], punten: [[9.5, 12.5, 1], [14.5, 12.5, 1]] },
  "logo-maker": { van: "#5B21B6", naar: "#A78BFA", paden: ["M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2L12 3Z"], punten: [[19, 5, 1.4], [5, 19, 1.4]] },
  "advertentie-op-maat": { van: "#9F1239", naar: "#FB7185", paden: ["M4 10v4a1 1 0 0 0 1 1h3l8 4V5L8 9H5a1 1 0 0 0-1 1Z", "M19 9.5a4 4 0 0 1 0 5", "M9 15l1 5h2"] },
  // domein & e-mail
  domeinnaam: { van: "#1E40AF", naar: "#60A5FA", paden: ["M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13Z", "M15.5 15.5L20 20"], punten: [[10.5, 10.5, 1.6]] },
  "domein-verhuizen": { van: "#0F766E", naar: "#5EEAD4", paden: ["M3 7h10v9H3V7Z", "M13 10h4l3 3v3h-7", "M5 20a2 2 0 1 0 0-4a2 2 0 1 0 0 4Z", "M17 20a2 2 0 1 0 0-4a2 2 0 1 0 0 4Z"] },
  "domein-beheren": { van: "#334155", naar: "#94A3B8", paden: ["M4 7h16", "M4 12h16", "M4 17h16"], punten: [[9, 7, 2], [15, 12, 2], [7, 17, 2]] },
  "zakelijke-mail": { van: "#1D4ED8", naar: "#93C5FD", paden: ["M3 6h18v12H3V6Z", "M3 7l9 6 9-6"] },
  // checks
  "website-check": { van: "#B45309", naar: "#FBBF24", paden: ["M13 2L5 14h6l-1 8 9-13h-6l0-7Z"] },
  "review-check": { van: "#C2410C", naar: "#FDBA74", paden: ["M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.8l6.1-.7L12 3.5Z"] },
  bedrijfscheck: { van: "#065F46", naar: "#34D399", paden: ["M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6l8-3Z", "M8.5 12l2.5 2.5 4.5-5"] },
  rekentools: { van: "#3730A3", naar: "#A5B4FC", paden: ["M6 3h12v18H6V3Z", "M9 7h6"], punten: [[9, 12, 1.1], [12, 12, 1.1], [15, 12, 1.1], [9, 16, 1.1], [12, 16, 1.1], [15, 16, 1.1]] },
  // groeien
  "google-reviews": { van: "#BE185D", naar: "#F9A8D4", paden: ["M4 5h16v11H9l-5 4V5Z", "M12 7.5l1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4L12 7.5Z"] },
  telefonie: { van: "#047857", naar: "#6EE7B7", paden: ["M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z"] },
  starters: { van: "#C026D3", naar: "#F0ABFC", paden: ["M12 3c3 2 5 6 5 10l-5 4-5-4c0-4 2-8 5-10Z", "M7 13l-3 3 1 3 3-1", "M17 13l3 3-1 3-3-1"], punten: [[12, 10, 1.6]] },
  // apps
  apps: { van: "#0C4A6E", naar: "#38BDF8", paden: ["M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z", "M10 18h4"], punten: [[9.5, 8, 1.3], [14.5, 8, 1.3], [9.5, 12.5, 1.3], [14.5, 12.5, 1.3]] },
  "apps-en-spelletjes": { van: "#4C1D95", naar: "#C4B5FD", paden: ["M7 8h10a5 5 0 0 1 5 5v1a3 3 0 0 1-5.4 1.8L15 14H9l-1.6 1.8A3 3 0 0 1 2 14v-1a5 5 0 0 1 5-5Z", "M8 11v3", "M6.5 12.5h3"], punten: [[16, 11.5, 1], [18, 13.5, 1]] },
};

export const MERK_SLEUTELS = Object.keys(MERKEN);

/** Het merk van een tool; onbekende sleutel → het merk van de website (nooit leeg). */
export const merkVan = (sleutel: string): Merk => MERKEN[sleutel] ?? MERKEN.website!;
