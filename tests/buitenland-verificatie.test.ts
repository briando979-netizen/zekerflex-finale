import { beforeEach, describe, expect, it, vi } from "vitest";

// Een bedrijf buiten Nederland heeft geen KVK: het blijft ongeverifieerd tot een beheerder het goedkeurt,
// en mag in de tussentijd één testklus plaatsen.

const m = vi.hoisted(() => ({
  tenant: { type: "ENTERPRISE_HQ", country: "DE", vatNumber: "DE123456789" as string | null, companyRegistration: null },
  kv: new Map<string, unknown>(),
  shifts: 0,
}));

vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => m.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void m.kv.set(k, v),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenant: { findUnique: async () => m.tenant },
    shiftAssignment: { count: async () => 0 },
    shift: { count: async () => m.shifts },
  },
}));

import { assertMayPlaceShift, setTenantApproval, tenantVerification } from "@/lib/company/verified";
import { setBuitenlandBewijs } from "@/lib/company/buitenland";

describe("verificatie van een buitenlands bedrijf", () => {
  beforeEach(() => {
    m.tenant = { type: "ENTERPRISE_HQ", country: "DE", vatNumber: "DE123456789", companyRegistration: null };
    m.kv.clear();
    m.shifts = 0;
  });

  it("met een btw-nummer: wacht op de beheerder en is gemarkeerd als buitenlands", async () => {
    expect(await tenantVerification("t1")).toEqual({ verified: false, via: null, inControle: true, buitenlands: true });
  });

  it("zonder btw-nummer maar met een registratienummer buiten de EU telt het ook als buitenlands", async () => {
    m.tenant = { type: "ENTERPRISE_HQ", country: "US", vatNumber: null, companyRegistration: null };
    await setBuitenlandBewijs("t1", { land: "US", btw: null, registratieNummer: "DE-7654321", at: "2026-11-09T10:00:00+01:00" });
    expect((await tenantVerification("t1")).buitenlands).toBe(true);
  });

  it("een buitenlands land zonder enig nummer is gewoon een nieuw bedrijf", async () => {
    m.tenant = { type: "ENTERPRISE_HQ", country: "DE", vatNumber: null, companyRegistration: null };
    expect(await tenantVerification("t1")).toEqual({ verified: false, via: null, inControle: false });
  });

  it("mag één testklus plaatsen, daarna niet meer", async () => {
    expect(await assertMayPlaceShift("t1")).toEqual({ test: true });
    m.shifts = 1;
    await expect(assertMayPlaceShift("t1")).rejects.toThrow(/één testklus/);
  });

  it("na goedkeuring door een beheerder is het geverifieerd en onbeperkt", async () => {
    await setTenantApproval("t1", true, "admin1");
    expect(await tenantVerification("t1")).toEqual({ verified: true, via: "admin" });
    m.shifts = 5;
    expect(await assertMayPlaceShift("t1")).toEqual({ test: false });
  });

  it("een Nederlands bedrijf houdt zijn gedrag: geen buitenlands-vlag", async () => {
    m.tenant = { type: "ENTERPRISE_HQ", country: "NL", vatNumber: "NL123456789B01", companyRegistration: null };
    expect(await tenantVerification("t1")).toEqual({ verified: false, via: null, inControle: false });
  });
});
