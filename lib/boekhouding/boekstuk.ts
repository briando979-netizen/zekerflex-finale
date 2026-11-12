// Boekstuknummers (puur): gapvrij per administratie, dagboek en jaar. De teller staat in BoekVolgnummer en wordt in
// dezelfde transactie verhoogd als de boeking wordt geschreven (boek.ts), zoals InvoiceSequence bij facturen.

import type { BoekDagboekNaam } from "./types";

const DAGBOEK_VOORVOEGSEL: Record<BoekDagboekNaam, string> = {
  VERKOOP: "VK",
  INKOOP: "IK",
  BANK: "BK",
  MEMORIAAL: "MM",
};

/** "VK-2026-000012" */
export function formatBoekstuk(dagboek: BoekDagboekNaam, jaar: number, volgnummer: number): string {
  return `${DAGBOEK_VOORVOEGSEL[dagboek]}-${jaar}-${String(volgnummer).padStart(6, "0")}`;
}

/** De boekdag "2026-04-10" als datum voor een @db.Date-kolom (middernacht UTC van die kalenderdag). */
export function boekDatum(dagSleutel: string): Date {
  return new Date(`${dagSleutel}T00:00:00.000Z`);
}

/** Jaar en maand uit een boekdag "2026-04-10". */
export function periodeVan(dagSleutel: string): { jaar: number; maand: number } {
  return { jaar: Number(dagSleutel.slice(0, 4)), maand: Number(dagSleutel.slice(5, 7)) };
}
