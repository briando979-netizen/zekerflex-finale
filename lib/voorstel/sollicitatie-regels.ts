// Regels voor sollicitaties bij Het Schwarzwald, los van de opslag zodat ze
// zonder database te testen zijn.

/** AVG-richtlijn: sollicitatiegegevens uiterlijk 4 weken na afloop wissen. */
export const BEWAAR_DAGEN = 28;

export const SOLLICITATIE_STATUS = ["nieuw", "gesprek", "aangenomen", "afgewezen"] as const;
export type SollicitatieStatus = (typeof SOLLICITATIE_STATUS)[number];

export const UREN = ["Fulltime (32 tot 40 uur)", "Parttime (16 tot 32 uur)", "Bijbaan (tot 16 uur)", "Oproepbasis, flexibel"] as const;

export const OPEN_SOLLICITATIE = "Open sollicitatie";

/** /vacatures (open sollicitatie) of /vacatures/<functie>. */
export const isVacaturePad = (pad: string) => /^\/vacatures(\/[a-z0-9-]{1,80})?$/.test(pad);

/** Wisdatum: BEWAAR_DAGEN na de laatste wijziging, zodat een lopende procedure blijft staan. */
export const wisDatum = (bijgewerkt: string) => new Date(new Date(bijgewerkt).getTime() + BEWAAR_DAGEN * 86_400_000);

export const verlopen = (bijgewerkt: string, nu: number) => wisDatum(bijgewerkt).getTime() <= nu;
