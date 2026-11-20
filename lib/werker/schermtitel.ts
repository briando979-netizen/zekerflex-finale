// De titel in de balk bovenaan de werker-app (components/app/FreelancerShell.tsx).
// De schermen uit de balk onderaan hebben hun eigen naam (nav); elk ander scherm
// (Verificatie, Profiel, Uitbetalingen, Hulp, ...) stond onder "Vind jouw klus".
// Puur: geen imports, zodat de shell (client) en de test het allebei kunnen gebruiken.
// De namen zelf staan vijftalig in lib/i18n/freelancer.ts (schermTitel).

/** het eerste stuk van het adres na /dashboard/ → de sleutel in `schermTitel` */
const SCHERMEN = {
  verificatie: "verificatie",
  profiel: "profiel",
  uitbetalingen: "uitbetalingen",
  verloning: "verloning",
  beschikbaarheid: "beschikbaarheid",
  administratie: "administratie",
  hulp: "hulp",
  inchecken: "inchecken",
  incheck: "inchecken",
  certificaten: "certificaten",
  favorieten: "favorieten",
  beoordelingen: "beoordelingen",
  paspoort: "paspoort",
  ritten: "ritten",
  fiscaal: "fiscaal",
  verzekering: "verzekering",
  vooruitblik: "vooruitblik",
  "agenda-koppeling": "agenda",
  wifi: "wifi",
  introduceren: "introduceren",
  assistent: "assistent",
} as const;

export type SchermTitelSleutel = (typeof SCHERMEN)[keyof typeof SCHERMEN] | "overig";

/** Alle sleutels die `schermTitel` in elke taal moet hebben. */
export const SCHERM_TITEL_SLEUTELS: readonly SchermTitelSleutel[] = [...new Set<SchermTitelSleutel>(Object.values(SCHERMEN)), "overig"];

/**
 * Welke naam hoort bij dit adres? Een scherm dat we niet kennen krijgt "overig"
 * (de neutrale titel), nooit de naam van een ander scherm.
 */
export function schermTitelSleutel(pathname: string): SchermTitelSleutel {
  const delen = pathname.split("?")[0]?.split("/").filter(Boolean) ?? [];
  if (delen[0] !== "dashboard") return "overig";
  const scherm = delen[1] ?? "";
  // hasOwn, niet `in`: anders telt "constructor" uit het adres als scherm
  return Object.hasOwn(SCHERMEN, scherm) ? SCHERMEN[scherm as keyof typeof SCHERMEN] : "overig";
}
