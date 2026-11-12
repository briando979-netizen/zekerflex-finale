// Een TEST-administratie is een proefadministratie: alleen daar mag (via een admin) gewist en gewijzigd worden.
// De schermen tonen zo'n administratie met een band; dit is het ene hulpje daarvoor.

export function isTestAdministratie(administratie: { soort?: string | null | undefined } | null | undefined): boolean {
  return administratie?.soort === "TEST";
}

/** De tekst voor de band boven een testadministratie. */
export const TEST_BAND_TEKST = "Testadministratie: dit zijn geen echte boeken. Alles hierin mag gewist worden.";
