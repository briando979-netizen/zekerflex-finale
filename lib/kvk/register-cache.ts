import type { CompanyProfile } from "@/types/company";

// ---------------------------------------------------------------------------
// Hoe lang een uitkomst van KVKBase per KVK-nummer geldt (lib/integrations/kvkbase.ts, sleutel kvk-register:v1:<nummer>:<enrich>).
// Gevonden (ook een opgeheven bedrijf, DISSOLVED): 30 dagen, een inschrijving verandert zelden en elke opvraging kost tegoed.
// Niet gevonden: 1 dag (13 nov 2026, besluit 86). Een werker die zijn verse inschrijving één dag te vroeg invult, zat anders
// 30 dagen vast op "geen inschrijving gevonden". Puur bestand, zodat de test met een bevroren klok kan draaien.
// ---------------------------------------------------------------------------

export const REGISTER_GEVONDEN_MS = 30 * 86_400_000;
export const REGISTER_NIET_GEVONDEN_MS = 86_400_000;

export type RegisterUitkomst = { at: string; profiel?: CompanyProfile; nietGevonden?: true };

/** De bewaarde uitkomst als hij nog geldt, anders null (ook bij een onleesbare of ontbrekende tijd). */
export function registerVers(u: RegisterUitkomst | null | undefined, nu: number): RegisterUitkomst | null {
  if (!u) return null;
  const at = Date.parse(u.at);
  if (Number.isNaN(at)) return null;
  const max = u.nietGevonden ? REGISTER_NIET_GEVONDEN_MS : REGISTER_GEVONDEN_MS;
  return nu - at < max ? u : null;
}
