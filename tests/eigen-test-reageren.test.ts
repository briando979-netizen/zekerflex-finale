import { beforeEach, describe, expect, it, vi } from "vitest";

// G2 (22 nov 2026, privé-accounts van de eigenaar): een eigen-test-werker reageert niet op een klus van een echt bedrijf en
// krijgt er geen melding over; een echte werker ziet en beantwoordt een klus van een eigen-testbedrijf niet
// (lib/admin/eigen-test-regel.ts). Zonder markeringen verandert er niets en wordt er niets extra opgevraagd.

const h = vi.hoisted(() => ({
  et: { tenants: {} as Record<string, string>, users: {} as Record<string, string> },
  email: "ik@mail.nl",
  memberships: [] as { role: string; tenantId: string }[],
  tenant: "t_echt",
  intern: ["u_intern"] as string[],
  leden: [] as string[],
  opzoekingen: 0,
  ledenOpgevraagd: 0,
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
        homeLatitude: 52.1,
        homeLongitude: 5.1,
        user: { kycStatus: "VERIFIED", email: h.email },
      }),
      // de ontvangers van een klus van een eigen-testbedrijf: intern, of in de lijst van eigen-test-accounts (user.OR)
      findMany: async (a: { where: { user: { OR: { id?: { in: string[] } }[] } } }) => {
        const ids = a.where.user.OR.flatMap((o) => o.id?.in ?? []);
        return [...ids, ...h.intern].map((userId) => ({ id: `f-${userId}`, userId }));
      },
    },
    shift: {
      findUnique: async () => ({
        id: "k1",
        status: "OPEN",
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        breakMinutes: 0,
        positions: 1,
        viaUitzendbureau: false,
        visibility: "PUBLIC",
        title: "Bediening",
        createdAt: new Date("2026-11-14T10:00:00Z"),
        branch: { tenantId: h.tenant, latitude: 52.1, longitude: 5.1, geofenceRadiusMeters: 150, tenant: { name: "Bedrijf" } },
        _count: { assignments: 0 },
      }),
    },
    user: {
      findUnique: async () => {
        h.opzoekingen += 1;
        return { email: h.email, memberships: h.memberships };
      },
    },
    membership: {
      findMany: async () => {
        h.ledenOpgevraagd += 1;
        return h.leden.map((userId) => ({ userId }));
      },
    },
  },
}));
vi.mock("@/lib/onboarding/werker-poort-server", () => ({ eisOnboardingVoorReageren: async () => undefined }));
vi.mock("@/lib/fiscal/eligibility", () => ({
  payoutEligibility: async () => ({ ok: true, track: "invoice", reason: null }),
  eisProefklusInSlot: vi.fn(),
}));
vi.mock("@/lib/uitzend/partners", () => ({ isUitzendPartnerTenant: async () => false }));
// de eerste controle ná de grondregel: wie hier komt, is door de grondregel heen
vi.mock("@/lib/employer/relations", () => ({
  isBlockedByAny: async () => {
    throw new Error("voorbij de grondregel");
  },
}));
vi.mock("@/lib/notifications/dispatcher", () => ({ recordOfferResponse: vi.fn() }));
vi.mock("@/lib/pools/store", () => ({ isInvitedToPoolOnlyShift: async () => true }));

import { applyToShift } from "@/lib/matching/apply";
import { testklusMeldfilter } from "@/lib/shifts/testklus-db";

const sinds = "2026-11-13T12:00:00.000Z";
const gemarkeerd = { tenants: { t_prive: sinds }, users: { u_werker: sinds } };
const VOORBIJ = "voorbij de grondregel";

beforeEach(() => {
  h.et = { tenants: {}, users: {} };
  h.email = "ik@mail.nl";
  h.memberships = [];
  h.tenant = "t_echt";
  h.intern = ["u_intern"];
  h.leden = [];
  h.opzoekingen = 0;
  h.ledenOpgevraagd = 0;
});

describe("reageren op een klus", () => {
  it("zonder markeringen verandert er niets en wordt er niets opgevraagd", async () => {
    await expect(applyToShift("u_echt", "k1")).rejects.toThrow(VOORBIJ);
    expect(h.opzoekingen).toBe(0);
  });

  it("een echte werker ziet een klus van een eigen-testbedrijf niet: dezelfde melding als bij een klus die er niet is", async () => {
    h.et = gemarkeerd;
    h.tenant = "t_prive";
    await expect(applyToShift("u_echt", "k1")).rejects.toThrow("Deze dienst bestaat niet meer.");
  });

  it("een eigen-test-werker reageert niet op een klus van een echt bedrijf", async () => {
    h.et = gemarkeerd;
    await expect(applyToShift("u_werker", "k1")).rejects.toThrow("Deze dienst is nog niet open voor aanmeldingen.");
  });

  it("een lid van een eigen-testbedrijf is zelf ook eigen test en reageert niet op een echt bedrijf", async () => {
    h.et = gemarkeerd;
    h.memberships = [{ role: "HQ_ADMIN", tenantId: "t_prive" }];
    await expect(applyToShift("u_ik", "k1")).rejects.toThrow("nog niet open");
  });

  it("een eigen-test-werker reageert wel op een klus van een eigen-testbedrijf", async () => {
    h.et = gemarkeerd;
    h.tenant = "t_prive";
    await expect(applyToShift("u_werker", "k1")).rejects.toThrow(VOORBIJ);
  });

  it("een echte werker reageert gewoon op een klus van een echt bedrijf", async () => {
    h.et = gemarkeerd;
    await expect(applyToShift("u_echt", "k1")).rejects.toThrow(VOORBIJ);
  });

  it("beheer en een intern adres reageren op beide soorten", async () => {
    h.et = gemarkeerd;
    h.memberships = [{ role: "PLATFORM_ADMIN", tenantId: "org_platform" }];
    h.tenant = "t_prive";
    await expect(applyToShift("u_admin", "k1")).rejects.toThrow(VOORBIJ);
    h.tenant = "t_echt";
    await expect(applyToShift("u_admin", "k1")).rejects.toThrow(VOORBIJ);
    h.memberships = [];
    h.email = "iemand@zekerflex.nl";
    h.tenant = "t_prive";
    await expect(applyToShift("u_intern", "k1")).rejects.toThrow(VOORBIJ);
  });
});

describe("meldingen over een klus (volgers, job-alerts, geo-push, spoedoproep)", () => {
  const kenmerk = (tenantId: string, createdAt = "2026-11-14T10:00:00.000Z") => ({ title: "Afwasser", tenantId, bedrijf: "Bedrijf", createdAt });

  it("zonder markeringen mag een gewone klus naar iedereen, zonder iets op te vragen", async () => {
    const f = await testklusMeldfilter();
    expect(await f.mag(kenmerk("t_echt"), "u_werker")).toBe(true);
    expect(h.ledenOpgevraagd).toBe(0);
  });

  it("een eigen-test-account krijgt geen melding over een klus van een echt bedrijf", async () => {
    h.et = gemarkeerd;
    h.leden = ["u_ik"];
    const f = await testklusMeldfilter();
    expect(await f.mag(kenmerk("t_echt"), "u_werker")).toBe(false);
    expect(await f.mag(kenmerk("t_echt"), "u_ik")).toBe(false);
    expect(await f.mag(kenmerk("t_echt"), "u_echt")).toBe(true);
    expect(h.ledenOpgevraagd).toBe(1);
  });

  it("een klus van een eigen-testbedrijf gaat alleen naar eigen-test-accounts en intern, ook als hij van vóór de markering is", async () => {
    h.et = gemarkeerd;
    const f = await testklusMeldfilter();
    for (const gemaakt of ["2026-11-14T10:00:00.000Z", "2026-11-01T10:00:00.000Z"]) {
      expect(await f.mag(kenmerk("t_prive", gemaakt), "u_werker")).toBe(true);
      expect(await f.mag(kenmerk("t_prive", gemaakt), "u_intern")).toBe(true);
      expect(await f.mag(kenmerk("t_prive", gemaakt), "u_echt")).toBe(false);
    }
  });
});
