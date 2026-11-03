// De 14 allergenen die je volgens de EU-regels (Verordening 1169/2011) aan
// gasten moet kunnen melden. Sleutels staan zo in HorecaItem.allergenen.

export const ALLERGENEN = {
  gluten: "Gluten",
  schaaldieren: "Schaaldieren",
  eieren: "Eieren",
  vis: "Vis",
  pinda: "Pinda's",
  soja: "Soja",
  melk: "Melk",
  noten: "Noten",
  selderij: "Selderij",
  mosterd: "Mosterd",
  sesam: "Sesamzaad",
  sulfiet: "Sulfiet",
  lupine: "Lupine",
  weekdieren: "Weekdieren",
} as const;

export type Allergeen = keyof typeof ALLERGENEN;

export const isAllergeen = (s: string): s is Allergeen => Object.prototype.hasOwnProperty.call(ALLERGENEN, s);

/** Alleen bekende allergenen, in vaste volgorde. */
export const schoneAllergenen = (lijst: readonly string[]): Allergeen[] => (Object.keys(ALLERGENEN) as Allergeen[]).filter((a) => lijst.includes(a));
