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

// SBI-groepen van de KvK die één soort zaak aanwijzen: 55.1 hotels, 56.1 restaurants (ook
// cafetaria's en ijssalons), 56.3 cafés. Lunchroom en bar zijn er niet uit af te leiden.
const SBI_SOORT: readonly (readonly [string, Soort])[] = [
  ["551", "hotel"],
  ["561", "restaurant"],
  ["563", "cafe"],
];

/** De soort zaak uit de SBI-codes van de inschrijving, of null. De eerste code die iets aanwijst telt: geef de hoofdactiviteit eerst. */
export function soortUitSbi(codes: readonly string[]): Soort | null {
  for (const code of codes) {
    const cijfers = code.replace(/\D/g, "");
    const gevonden = SBI_SOORT.find(([groep]) => cijfers.startsWith(groep));
    if (gevonden) return gevonden[1];
  }
  return null;
}
