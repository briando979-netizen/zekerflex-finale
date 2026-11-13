import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REGISTER_GEVONDEN_MS, REGISTER_NIET_GEVONDEN_MS, registerVers, type RegisterUitkomst } from "@/lib/kvk/register-cache";
import type { CompanyProfile } from "@/types/company";

// De bewaartermijn van een KVKBase-uitkomst per nummer (13 nov 2026, besluit 86): gevonden 30 dagen, "niet gevonden" 1 dag,
// zodat een verse inschrijving die één dag te vroeg is ingevuld niet een maand vastzit. Bevroren klok: de controle vóór uitrol
// draait in UTC.

const NU = new Date("2026-11-13T12:00:00+01:00");
const UUR = 3_600_000;
const DAG = 86_400_000;
const gevonden: RegisterUitkomst = { at: NU.toISOString(), profiel: { kvkNumber: "12345678" } as CompanyProfile };
const nietGevonden: RegisterUitkomst = { at: NU.toISOString(), nietGevonden: true };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NU);
});
afterEach(() => vi.useRealTimers());

describe("registerVers", () => {
  it("gevonden geldt 30 dagen, niet gevonden 1 dag", () => {
    expect(REGISTER_GEVONDEN_MS).toBe(30 * DAG);
    expect(REGISTER_NIET_GEVONDEN_MS).toBe(DAG);
    expect(registerVers(gevonden, Date.now() + 29 * DAG)).toBe(gevonden);
    expect(registerVers(gevonden, Date.now() + 30 * DAG)).toBeNull();
    expect(registerVers(nietGevonden, Date.now() + 23 * UUR)).toBe(nietGevonden);
    expect(registerVers(nietGevonden, Date.now() + DAG)).toBeNull();
  });

  it("een inschrijving van gisteren die vandaag pas in KVKBase staat, wordt na een dag opnieuw opgevraagd", () => {
    // gisteren "niet gevonden" bewaard; vandaag kijkt lookupCompany opnieuw bij KVKBase (null = geen uitkomst uit de cache)
    const gisteren: RegisterUitkomst = { at: new Date(Date.now() - DAG - UUR).toISOString(), nietGevonden: true };
    expect(registerVers(gisteren, Date.now())).toBeNull();
    // een gevonden bedrijf van gisteren komt wel uit de cache (kost geen tegoed)
    expect(registerVers({ ...gevonden, at: gisteren.at }, Date.now())).not.toBeNull();
  });

  it("niets, of een onleesbare tijd, geldt niet", () => {
    expect(registerVers(null, Date.now())).toBeNull();
    expect(registerVers(undefined, Date.now())).toBeNull();
    expect(registerVers({ at: "gisteren", nietGevonden: true }, Date.now())).toBeNull();
  });
});
