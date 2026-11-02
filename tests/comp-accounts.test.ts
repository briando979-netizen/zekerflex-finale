import { beforeEach, describe, expect, it, vi } from "vitest";

// Kosteloze accounts: de eigenaar geeft een account (en zijn bedrijf) elke
// betaalde functie voor € 0, zonder beheerdersrechten.

const store = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => structuredClone(store.get(k) ?? null),
  kvSet: async (k: string, v: unknown) => void store.set(k, structuredClone(v)),
}));
const audit = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({ recordAudit: (...a: unknown[]) => audit(...a) }));
vi.mock("@/lib/prisma", () => ({ prisma: { apiSubscription: { findUnique: async () => null }, managedWebsite: { findUnique: async () => null } } }));

import { freeAccess, isCompTenant, isCompUser, listComp, setComp } from "@/lib/billing/comp";
import { freePricing } from "@/lib/telephony/lines";
import { DEFAULT_PRICING, quote } from "@/lib/telephony/plans";
import { resolveTenantPlan } from "@/lib/api-plans/resolve";
import { mayPublish } from "@/lib/sites/access";
import { buildReverseBillingInvoices } from "@/lib/billing/self-billing";
import type { Principal } from "@/lib/auth";

const person = (userId: string, role: "HQ_ADMIN" | "PLATFORM_ADMIN", tenantId = "t-test"): Principal =>
  ({ userId, email: `${userId}@x.nl`, fullName: userId, grants: [{ role, organizationId: tenantId, locationIds: [] }], memberships: [{ tenantId, role }], managedBranchIds: [] }) as unknown as Principal;
const owner = { userId: "admin", name: "Eigenaar" };

beforeEach(() => {
  store.clear();
  audit.mockClear();
});

describe("kosteloos account", () => {
  it("geeft het account en zijn bedrijf alles gratis, geaudit, en kan weer uit", async () => {
    expect(await isCompUser("u-test")).toBe(false);
    await setComp({ userId: "u-test", email: "testbedrijven@gmail.com", tenantIds: ["t-test"], on: true, reason: "eigen testaccount", by: owner });
    expect(await isCompUser("u-test")).toBe(true);
    expect(await isCompTenant("t-test")).toBe(true);
    expect(await isCompTenant("t-ander")).toBe(false);
    expect((await listComp()).map((e) => e.email)).toEqual(["testbedrijven@gmail.com"]);
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: "billing.comp.granted", targetId: "u-test" }));

    await setComp({ userId: "u-test", email: "testbedrijven@gmail.com", tenantIds: [], on: false, reason: "", by: owner });
    expect(await isCompUser("u-test")).toBe(false);
    expect(audit).toHaveBeenLastCalledWith(expect.objectContaining({ action: "billing.comp.revoked" }));
  });

  it("gratis toegang: beheerders en kosteloze accounts wel, gewone klanten niet", async () => {
    await setComp({ userId: "u-test", email: "t@x.nl", tenantIds: ["t-test"], on: true, reason: "", by: owner });
    expect(await freeAccess(person("u-test", "HQ_ADMIN"))).toBe(true);
    expect(await freeAccess(person("u-klant", "HQ_ADMIN", "t-klant"))).toBe(false);
    expect(await freeAccess(person("u-beheer", "PLATFORM_ADMIN"))).toBe(true);
    expect(await freeAccess(null)).toBe(false);
  });

  it("mag een website publiceren zonder abonnement; een gewone klant niet", async () => {
    await setComp({ userId: "u-test", email: "t@x.nl", tenantIds: ["t-test"], on: true, reason: "", by: owner });
    expect(await mayPublish(person("u-test", "HQ_ADMIN"), "t-test")).toBe(true);
    expect(await mayPublish(person("u-klant", "HQ_ADMIN", "t-klant"), "t-klant")).toBe(false);
  });

  it("krijgt het hoogste API-pakket", async () => {
    expect((await resolveTenantPlan("t-test")).key).toBe("free");
    await setComp({ userId: "u-test", email: "t@x.nl", tenantIds: ["t-test"], on: true, reason: "", by: owner });
    expect((await resolveTenantPlan("t-test")).key).toBe("scale");
  });
});

describe("€ 0 in de praktijk", () => {
  it("telefonie kost € 0; nummers via een partner blijven op aanvraag", () => {
    const free = freePricing(DEFAULT_PRICING);
    expect(free.lineCents).toBe(0);
    expect(Object.values(free.optionCents).every((c) => c === 0)).toBe(true);
    expect(Object.values(free.bundleCents).every((c) => c === 0)).toBe(true);
    expect(free.numberCents.mobiel06).toBeNull();
    const q = quote({ kind: "mobiel097", bundle: "compleet", options: ["ai", "sms"] }, free);
    expect(q.monthlyCents).toBe(0);
  });

  it("de bemiddelingsfee per uur wordt een factuur van precies € 0", () => {
    const billing = buildReverseBillingInvoices({
      timesheetId: "ts1",
      billableMinutes: 480,
      hourlyRateCents: 2000,
      freelancerId: "f1",
      freelancerCountry: "NL",
      freelancerVatValid: true,
      recipientTenantId: "t-test",
      recipientCountry: "NL",
      platformTenantId: "org_platform",
      shiftTitle: "Shift",
      workedOn: new Date("2026-11-02T08:00:00Z"),
      freelancerInvoiceNumber: "F-1",
      platformInvoiceNumber: "P-1",
      platformFeePerHourCents: 0,
    });
    expect(billing.platformFeeInvoice.totalCents).toBe(0);
    expect(billing.platformFeeInvoice.vatCents).toBe(0);
    expect(billing.freelancerInvoice.totalCents).toBeGreaterThan(0); // de flexwerker krijgt gewoon betaald
  });
});
