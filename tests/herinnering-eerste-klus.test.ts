import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KlusFeiten } from "@/lib/onboarding/klaar-voor-klus";

// De herinnering na de aanmelding (eigenaar 16 nov): zijn de 5 stappen af maar mist er nog iets wat reageren tegenhoudt,
// dan noemt de herinnering dat. Niet het nakijken van het ID of de KVK-controle: daar kan de werker niets aan doen.

const h = vi.hoisted(() => ({ klaar: true, feiten: null as KlusFeiten | null }));

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/fiscal/store", () => ({ getFiscal: async () => ({}), fiscaalIngevuld: () => false, invoiceModeFor: () => "payroll" }));
vi.mock("@/lib/agreements/uitzend-contract", () => ({ activeUitzendContract: async () => null }));
vi.mock("@/lib/onboarding/werker-poort-server", () => ({
  werkerPoortStand: async () => ({ klaar: h.klaar, soortGekozen: true, branchesGekozen: true, gegevensIngevuld: true, identiteitIngestuurd: true, fotoGezet: true }),
}));
vi.mock("@/lib/onboarding/klaar-voor-klus-server", () => ({ klusFeiten: async () => h.feiten }));

const basis: KlusFeiten = { soort: "uitzendkracht", payroll: true, idGoedgekeurd: false, bsn: false, contract: false, bedrijf: false, kvkWacht: false, iban: false, werkrechtOpen: true };

beforeEach(() => {
  h.klaar = true;
  h.feiten = { ...basis };
});

describe("werkerMist na de aanmelding", () => {
  it("uitzendkracht: BSN, overeenkomst, rekeningnummer en recht om te werken; niet het ID nakijken", async () => {
    const { werkerMist } = await import("@/lib/onboarding/herinnering-mist");
    expect(await werkerMist("u1")).toEqual(["bsn", "contract", "iban", "werkrecht"]);
  });

  it("zzp'er: KVK/btw/KOR heet 'btw' in de herinnering; wacht de KVK-controle, dan niet", async () => {
    const { werkerMist } = await import("@/lib/onboarding/herinnering-mist");
    h.feiten = { ...basis, soort: "zzp", payroll: false, werkrechtOpen: false };
    expect(await werkerMist("u1")).toEqual(["btw", "iban"]);
    h.feiten = { ...basis, soort: "zzp", payroll: false, kvkWacht: true, iban: true, werkrechtOpen: false };
    expect(await werkerMist("u1")).toEqual([]);
  });

  it("alleen nog het ID nakijken: geen herinnering", async () => {
    const { werkerMist } = await import("@/lib/onboarding/herinnering-mist");
    h.feiten = { ...basis, bsn: true, contract: true, iban: true, werkrechtOpen: false };
    expect(await werkerMist("u1")).toEqual([]);
  });
});
