import { beforeEach, describe, expect, it, vi } from "vitest";

// payoutEligibility (de poort vóór reageren, aannemen en tegenbod) controleert na de
// fiscale eisen ook het recht om in Nederland te werken (lib/werkrecht).

const h = vi.hoisted(() => ({
  fiscal: {} as Record<string, unknown>,
  profiel: { kvkValid: true, vatValid: false, payoutIban: null } as Record<string, unknown> | null,
  werkrecht: { ok: true, reden: null } as { ok: boolean; reden: string | null },
  gevraagd: [] as string[],
}));

vi.mock("@/lib/prisma", () => ({ prisma: { freelancerProfile: { findUnique: async () => h.profiel } } }));
vi.mock("@/lib/fiscal/store", () => ({
  getFiscal: async () => h.fiscal,
  invoiceModeFor: (f: Record<string, unknown>) => (f.workerKind === "uitzendkracht" ? "payroll" : "invoice"),
}));
vi.mock("@/lib/agreements/uitzend-contract", () => ({ activeUitzendContract: async () => ({ id: "c1" }) }));
vi.mock("@/lib/werkrecht/store", () => ({
  werkrechtVoorWerk: async (_u: string, land: string) => {
    h.gevraagd.push(land);
    return h.werkrecht;
  },
}));

describe("payoutEligibility + recht om te werken", () => {
  beforeEach(() => {
    h.fiscal = {};
    h.profiel = { kvkValid: true, vatValid: false, payoutIban: "NL00TEST0000000000" };
    h.werkrecht = { ok: true, reden: null };
    h.gevraagd = [];
  });

  it("alles in orde: ok", async () => {
    const { payoutEligibility } = await import("@/lib/fiscal/eligibility");
    expect(await payoutEligibility("u1")).toEqual({ ok: true, track: "invoice", reason: null });
    expect(h.gevraagd).toEqual(["NL"]);
  });

  it("geen recht om te werken: niet ok, met de reden van het werkrecht (beide sporen)", async () => {
    const { payoutEligibility } = await import("@/lib/fiscal/eligibility");
    h.werkrecht = { ok: false, reden: "Upload je document" };
    expect(await payoutEligibility("u1")).toEqual({ ok: false, track: "invoice", reason: "Upload je document" });

    h.fiscal = { workerKind: "uitzendkracht", bsnHash: "x", iban: "NL00" };
    expect(await payoutEligibility("u1")).toEqual({ ok: false, track: "payroll", reason: "Upload je document" });
  });

  it("zonder IBAN: niet ok, met de reden die naar de bankstap wijst (het IBAN zit niet meer in de onboarding)", async () => {
    const { payoutEligibility } = await import("@/lib/fiscal/eligibility");
    h.profiel = { kvkValid: true, vatValid: false, payoutIban: null };
    const uit = await payoutEligibility("u1");
    expect(uit.ok).toBe(false);
    expect(uit.reason).toContain("IBAN");
    expect(h.gevraagd).toEqual([]);
  });

  it("eerst de fiscale eis: zonder KVK/KOR die melding, het werkrecht wordt dan niet gevraagd", async () => {
    const { payoutEligibility } = await import("@/lib/fiscal/eligibility");
    h.profiel = { kvkValid: false, vatValid: false, payoutIban: null };
    h.werkrecht = { ok: false, reden: "Upload je document" };
    const uit = await payoutEligibility("u1");
    expect(uit.ok).toBe(false);
    expect(uit.reason).toContain("KVK");
    expect(h.gevraagd).toEqual([]);
  });
});
