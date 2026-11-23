import { beforeEach, describe, expect, it, vi } from "vitest";

// Unverified company (23 nov 2026): klussen plaatsen is vrij, reacties komen binnen, maar niemand wordt ingepland: de server
// weigert met een 423 en een eigen code (eisBedrijfGecontroleerd). Het aantal klussen is niet meer beperkt.

const m = vi.hoisted(() => ({
  tenant: { type: "ENTERPRISE_HQ", companyRegistration: null as null | { isActive: boolean; insolvent: boolean } },
  kv: new Map<string, unknown>(),
  assignments: 0,
  shifts: 0,
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => m.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, v),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: async () => m.tenant },
    shiftAssignment: { count: async () => m.assignments },
    shift: { count: async () => m.shifts },
  },
}));

import { eisBedrijfGecontroleerd, setKvkBewijs, setTenantApproval, tenantVerification } from "@/lib/company/verified";

/** De fout die eisBedrijfGecontroleerd gooit, of null als het bedrijf mag inplannen. */
const weigering = () => eisBedrijfGecontroleerd("t1").then(() => null, (e: unknown) => e as Error & { status?: number; code?: string });

describe("company verification gate", () => {
  beforeEach(() => {
    m.tenant = { type: "ENTERPRISE_HQ", companyRegistration: null };
    m.kv.clear();
    m.assignments = 0;
    m.shifts = 0;
  });

  it("a new company without KVK is not verified: inplannen is dicht met een 423 en een eigen code, hoeveel klussen het ook heeft", async () => {
    expect((await tenantVerification("t1")).verified).toBe(false);
    for (const aantal of [0, 1, 7]) {
      m.shifts = aantal;
      const fout = await weigering();
      expect(fout).toMatchObject({ status: 423, code: "BEDRIJF_NOG_NIET_GECONTROLEERD" });
      // 22 nov 2026 (eigenaar): nergens het woord "test" in wat een bedrijf te lezen krijgt
      expect(fout?.message ?? "").not.toMatch(/test/i);
      expect(fout?.message ?? "").toContain("Je klus staat live");
    }
  });

  it("active KVK alone is not enough: anyone can type a number, so ZekerFlex checks by hand (inControle)", async () => {
    m.tenant.companyRegistration = { isActive: true, insolvent: false };
    expect(await tenantVerification("t1")).toEqual({ verified: false, via: null, inControle: true });
    expect(await weigering()).toMatchObject({ status: 423, code: "BEDRIJF_NOG_NIET_GECONTROLEERD" });
  });

  it("active KVK + proof the registrant belongs to it (own domain) → verified, inplannen mag", async () => {
    m.tenant.companyRegistration = { isActive: true, insolvent: false };
    await setKvkBewijs("t1", { via: "domein", domein: "bakkerijjansen.nl", at: "2026-11-04T07:00:00.000Z" });
    m.shifts = 5;
    expect(await tenantVerification("t1")).toEqual({ verified: true, via: "kvk" });
    expect(await weigering()).toBeNull();
  });

  it("active KVK in control + admin approval → verified via admin", async () => {
    m.tenant.companyRegistration = { isActive: true, insolvent: false };
    await setTenantApproval("t1", true, "admin@zekerflex.nl");
    expect(await tenantVerification("t1")).toEqual({ verified: true, via: "admin" });
  });

  it("insolvent company does not count as verified", async () => {
    m.tenant.companyRegistration = { isActive: true, insolvent: true };
    expect((await tenantVerification("t1")).verified).toBe(false);
  });

  it("admin approval can be given and taken back", async () => {
    await setTenantApproval("t1", true, "admin@zekerflex.nl");
    expect(await tenantVerification("t1")).toEqual({ verified: true, via: "admin" });
    await setTenantApproval("t1", false, "admin@zekerflex.nl");
    expect((await tenantVerification("t1")).verified).toBe(false);
  });

  it("existing customers that already scheduled people are never blocked", async () => {
    m.assignments = 3;
    expect(await tenantVerification("t1")).toEqual({ verified: true, via: "history" });
  });
});
