import { beforeEach, describe, expect, it, vi } from "vitest";

// G3 en G4 (22 nov 2026, privé-accounts van de eigenaar): de klussenlijst en de kluspagina van de werker. Een klus van een
// eigen-testbedrijf staat er alleen voor eigen-test-accounts en interne accounts, ook als hij per ongeluk openbaar staat of iemand
// de directe link heeft; voor een echte werker is het dezelfde uitkomst als bij een klus die er niet is (de pagina geeft 404, geen 403).

const h = vi.hoisted(() => ({
  et: { tenants: {} as Record<string, string>, users: {} as Record<string, string> },
  email: "ik@mail.nl",
  memberships: [] as { role: string; tenantId: string }[],
  rows: [] as Record<string, unknown>[],
  wheres: [] as { branch?: { tenantId?: { notIn?: string[] } } }[],
  opzoekingen: 0,
}));

vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => h.et }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: {
      findUnique: async () => ({
        id: "fp1",
        kvkValid: true,
        isBlacklisted: false,
        matchingBlockedUntil: null,
        homeLatitude: 52.37,
        homeLongitude: 4.9,
        homePostalCode: "1011 AB",
        reliabilityScore: 0.8,
        skills: [],
        companyRegistration: null,
        user: { kycStatus: "VERIFIED" },
      }),
    },
    shiftAssignment: { findMany: async () => [], findUnique: async () => null },
    shift: {
      findMany: async (a: { where: { branch?: { tenantId?: { notIn?: string[] } } } }) => {
        h.wheres.push(a.where);
        const weg = a.where.branch?.tenantId?.notIn ?? [];
        return h.rows.filter((r) => !weg.includes((r.branch as { tenantId: string }).tenantId));
      },
      findUnique: async (a: { where: { id: string } }) => h.rows.find((r) => r.id === a.where.id) ?? null,
    },
    modelAgreement: { findFirst: async () => null },
    user: {
      findUnique: async () => {
        h.opzoekingen += 1;
        return { email: h.email, memberships: h.memberships };
      },
    },
  },
}));
vi.mock("@/lib/onboarding/werker-poort-server", () => ({ ONBOARDING_EERST: "eerst", onboardingKlaarVoorReageren: async () => true }));
vi.mock("@/lib/reviews/ratings", () => ({ companyRatings: async () => new Map() }));
vi.mock("@/lib/payouts/fastpay", () => ({ fastPayAvailableFor: async () => new Map() }));
vi.mock("@/lib/prefs/store", () => ({ getPrefs: async () => ({ jobAlerts: [], marketplaceSeenAt: null }) }));
vi.mock("@/lib/replacements/store", () => ({ listReplacementRequests: async () => [] }));
vi.mock("@/lib/offers/store", () => ({ offersForUser: async () => [], myOfferForShift: async () => null }));
vi.mock("@/lib/offers/verval", () => ({ reactieVervalt: () => false }));
vi.mock("@/lib/reservebank/store", () => ({ reserveReactieIds: async () => new Set() }));
vi.mock("@/lib/employer/relations", () => ({ tenantsBlockingUser: async () => new Set(), tenantsFavoritingUser: async () => new Set() }));
vi.mock("@/lib/fiscal/eligibility", () => ({ payoutEligibility: async () => ({ ok: true, track: "invoice", reason: null }) }));
vi.mock("@/lib/worker/follows", () => ({ followedTenantIds: async () => [] }));
vi.mock("@/lib/worker/zoeklocatie", () => ({ getZoeklocatie: async () => null }));
vi.mock("@/lib/shifts/worker-overlap", () => ({ overlapsAny: () => false }));
vi.mock("@/lib/matching/job-alerts", () => ({ matchingAlert: () => null }));
vi.mock("@/lib/profile/store", () => ({ getKlusBeelden: async () => new Map() }));
vi.mock("@/lib/uitzend/partners", () => ({ leesUitzendPartners: async () => ({}) }));

import { getMarketplace, getShiftDetail } from "@/lib/dashboard/marketplace";

const sinds = "2026-11-13T12:00:00.000Z";
const gemarkeerd = { tenants: { t_prive: sinds }, users: { u_werker: sinds } };

/** Een klus met alles wat de lijst én de kluspagina uit de database vragen. */
function rij(id: string, tenantId: string, bedrijf: string) {
  const start = new Date(Date.now() + 2 * 86_400_000);
  return {
    id,
    title: `Afwasser ${id}`,
    description: null,
    dresscode: null,
    extraInfo: null,
    startsAt: start,
    endsAt: new Date(start.getTime() + 6 * 3_600_000),
    breakMinutes: 30,
    hourlyRateCents: 1650,
    positions: 2,
    annuleerUren: 48,
    status: "OPEN",
    createdAt: new Date("2026-11-14T10:00:00Z"),
    branchId: `b_${tenantId}`,
    viaUitzendbureau: false,
    requiredSkill: null,
    branch: {
      name: "Hoofdlocatie",
      city: "Amsterdam",
      latitude: 52.37,
      longitude: 4.9,
      addressLine: "Damrak 1",
      postalCode: "1012 LG",
      geofenceRadiusMeters: 150,
      matchingConfig: null,
      tenantId,
      tenant: { name: bedrijf },
    },
    _count: { assignments: 0 },
  };
}

beforeEach(() => {
  h.et = { tenants: {}, users: {} };
  h.email = "ik@mail.nl";
  h.memberships = [];
  h.rows = [rij("k_echt", "t_echt", "Bakkerij Jansen"), rij("k_prive", "t_prive", "Mijn bedrijf")];
  h.wheres = [];
  h.opzoekingen = 0;
});

describe("de klussenlijst", () => {
  it("zonder markeringen staan alle klussen erin en wordt er niets opgevraagd", async () => {
    const m = await getMarketplace("u_echt");
    expect(m.shifts.map((s) => s.id).sort()).toEqual(["k_echt", "k_prive"]);
    expect(h.wheres[0]?.branch).toBeUndefined();
    expect(h.opzoekingen).toBe(0);
  });

  it("een echte werker ziet geen klus van een eigen-testbedrijf, ook niet zonder pool (openbaar)", async () => {
    h.et = gemarkeerd;
    const m = await getMarketplace("u_echt");
    expect(m.shifts.map((s) => s.id)).toEqual(["k_echt"]);
    expect(h.wheres[0]?.branch).toEqual({ tenantId: { notIn: ["t_prive"] } });
  });

  it("een eigen-test-werker ziet de klussen van het eigen-testbedrijf, en ook die van echte bedrijven", async () => {
    h.et = gemarkeerd;
    const m = await getMarketplace("u_werker");
    expect(m.shifts.map((s) => s.id).sort()).toEqual(["k_echt", "k_prive"]);
    expect(h.wheres[0]?.branch).toBeUndefined();
  });

  it("beheer en een lid van het eigen-testbedrijf zien ze ook", async () => {
    h.et = gemarkeerd;
    h.memberships = [{ role: "PLATFORM_ADMIN", tenantId: "org_platform" }];
    expect((await getMarketplace("u_admin")).shifts.map((s) => s.id).sort()).toEqual(["k_echt", "k_prive"]);
    h.memberships = [{ role: "HQ_ADMIN", tenantId: "t_prive" }];
    expect((await getMarketplace("u_ik")).shifts.map((s) => s.id).sort()).toEqual(["k_echt", "k_prive"]);
  });
});

describe("de kluspagina", () => {
  it("een echte werker met de directe link krijgt hetzelfde als bij een klus die er niet is (null: de pagina geeft 404)", async () => {
    h.et = gemarkeerd;
    expect(await getShiftDetail("u_echt", "k_prive")).toBeNull();
    expect(await getShiftDetail("u_echt", "bestaat_niet")).toBeNull();
    expect((await getShiftDetail("u_echt", "k_echt"))?.id).toBe("k_echt");
  });

  it("een eigen-test-werker en intern personeel openen hem wel", async () => {
    h.et = gemarkeerd;
    expect((await getShiftDetail("u_werker", "k_prive"))?.clientTenantId).toBe("t_prive");
    h.memberships = [{ role: "SALES", tenantId: "org_platform" }];
    expect((await getShiftDetail("u_sales", "k_prive"))?.clientTenantId).toBe("t_prive");
  });

  it("zonder markeringen opent iedereen alles, zonder iets op te vragen", async () => {
    expect((await getShiftDetail("u_echt", "k_prive"))?.id).toBe("k_prive");
    expect(h.opzoekingen).toBe(0);
  });
});
