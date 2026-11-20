// Stelt deze werker zelf een uurtarief in? (20 nov 2026)
//
// Een uitzendkracht niet: zijn loon volgt uit de cao en de klus. Een minimum- of richttarief betekent voor hem niets,
// dus het scherm Beschikbaarheid toont die velden dan niet (de bewaarde waarden blijven ongemoeid).
// Een zzp'er of flexwerker wel. Wie beide is (verloning, maar ook een eigen KVK- of btw-nummer) houdt de velden.
//
// Puur: geen prisma, kv of andere servercode, zodat pagina, scherm en test het alle drie kunnen gebruiken.
// De regel voor "verloning" is dezelfde als invoiceModeFor() in lib/fiscal/store.ts.

export interface TariefGegevens {
  workerKind: "zzp" | "flexwerker" | "uitzendkracht" | null;
  invoiceMode: "reverse-billing" | "self-invoice" | "payroll" | null;
  kvkNumber: string | null;
  vatNumber: string | null;
}

/** Waar als de werker de tariefvelden hoort te zien; onbekend (null, nog niets gekozen) telt als waar. */
export function toontEigenTarief(f: TariefGegevens | null | undefined): boolean {
  if (!f) return true;
  const verloning = f.invoiceMode ? f.invoiceMode === "payroll" : f.workerKind === "uitzendkracht";
  if (!verloning) return true;
  const eigenBedrijf = Boolean(f.kvkNumber?.trim()) || Boolean(f.vatNumber?.trim());
  return eigenBedrijf;
}
