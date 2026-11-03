// Soorten horecazaken (HorecaZaak.soort). Los bestand, zodat de browser het
// kan gebruiken zonder de invoerschema's.

export const SOORTEN = ["restaurant", "cafe", "lunchroom", "bar", "hotel"] as const;
export type Soort = (typeof SOORTEN)[number];

export const SOORT_LABEL: Record<Soort, string> = {
  restaurant: "Restaurant",
  cafe: "Café",
  lunchroom: "Lunchroom",
  bar: "Bar",
  hotel: "Hotel",
};

export const soortLabel = (s: string) => (SOORT_LABEL as Record<string, string>)[s] ?? s;
