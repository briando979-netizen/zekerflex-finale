import { beforeEach, describe, expect, it, vi } from "vitest";

// Unverified company: one test klus, reactions allowed, nobody scheduled.

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

import { assertMayPlaceShift, setKvkBewijs, setTenantApproval, tenantVerification } from "@/lib/company/verified";

describe("company verification gate", () => {
  beforeEach(() => {
    m.tenant = { type: "ENTERPRISE_HQ", companyRegistration: null };
    m.kv.clear();
    m.assignments = 0;
    m.shifts = 0;
  });

  it("a new company without KVK is not verified and may place exactly one test klus", async () => {
    expect((await tenantVerification("t1")).verified).toBe(false);
    expect(await assertMayPlaceShift("t1")).toEqual({ test: true });
    m.shifts = 1;
    await expect(assertMayPlaceShift("t1")).rejects.toThrow(/één testklus/);
  });

  it("active KVK alone is not enough: anyone can type a number, so ZekerFlex checks by hand (inControle)", async () => {
    m.tenant.companyRegistration = { isActive: true, insolvent: false };
    expect(await tenantVerification("t1")).toEqual({ verified: false, via: null, inControle: true });
    m.shifts = 1;
    await expect(assertMayPlaceShift("t1")).rejects.toThrow(/één testklus/);
  });

  it("active KVK + proof the registrant belongs to it (own domain) → verified, unlimited klussen", async () => {
    m.tenant.companyRegistration = { isActive: true, insolvent: false };
    await setKvkBewijs("t1", { via: "domein", domein: "bakkerijjansen.nl", at: "2026-11-04T07:00:00.000Z" });
    m.shifts = 5;
    expect(await tenantVerification("t1")).toEqual({ verified: true, via: "kvk" });
    expect(await assertMayPlaceShift("t1")).toEqual({ test: false });
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
