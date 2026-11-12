// ---------------------------------------------------------------------------
// Btw-concept: kleine hulpjes voor het scherm (puur, zonder prisma, veilig in de browser).
// ---------------------------------------------------------------------------

import { amsterdamParts } from "@/lib/time/amsterdam";
import type { MeldingErnst } from "./labels";

/** Het laatst afgesloten kwartaal op de Amsterdamse dag van `nu`: dat is meestal het kwartaal dat je nu indient. */
export function standaardKwartaal(nu: Date): { jaar: number; kwartaal: number } {
  const { year, month } = amsterdamParts(nu);
  const huidig = Math.floor((month - 1) / 3) + 1;
  return huidig === 1 ? { jaar: year - 1, kwartaal: 4 } : { jaar: year, kwartaal: huidig - 1 };
}

/** De jaren die in de keuze staan: dit jaar en de twee jaren ervoor. */
export function jaarKeuzes(nu: Date): number[] {
  const { year } = amsterdamParts(nu);
  return [year, year - 1, year - 2];
}

export const ERNST_TEKST: Readonly<Record<MeldingErnst, string>> = {
  blokkeert: "Eerst oplossen",
  "let-op": "Let op",
  info: "Ter info",
};

export const ERNST_TONE: Readonly<Record<MeldingErnst, "crit" | "warn" | "neutral">> = {
  blokkeert: "crit",
  "let-op": "warn",
  info: "neutral",
};
