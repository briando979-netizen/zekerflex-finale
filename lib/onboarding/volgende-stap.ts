import type { POORT_STAPPEN } from "@/lib/onboarding/werker-poort";

// Na de ID-scan: waar de volgende open stap van de poort (poortStapVan) heen gaat (13 nov 2026, meting fd: 20 van de 24
// werkers met een ID kwamen niet bij de foto, omdat gegevens of branches nog open stonden en niemand ze dat zei). Een
// gewone link, dus een volledige paginalading met verse poort en status. Puur: ook in de browser en los te testen.

export type PoortSleutel = (typeof POORT_STAPPEN)[number]["sleutel"];

export interface VolgendeStap {
  n: number;
  totaal: number;
  sleutel: PoortSleutel;
}

export function volgendeStapHref(sleutel: PoortSleutel): string {
  switch (sleutel) {
    case "gegevens":
      return "/dashboard/verificatie#gegevens-mist-kop";
    case "foto":
      return "/dashboard/eerste-indruk?stap=foto";
    default:
      // richting en branches kiest de werker in de wizard op Klussen; de ID is na de scan al ingestuurd
      return "/dashboard/klussen";
  }
}
