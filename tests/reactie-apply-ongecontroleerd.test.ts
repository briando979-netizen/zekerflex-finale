import { beforeEach, describe, expect, it, vi } from "vitest";

// applyToShift is de weg van "Aannemen", van een reeks dagen, van een antwoord op een spoedoproep en van een vaste-schil-reactie.
// Bij een bedrijf dat nog niet is gecontroleerd (23 nov 2026) gaat die reactie niet verloren: de match op VIEWED, een gewone reactie
// bij het bedrijf onder "Heeft gereageerd", en alleen het inplannen wacht op de poort. Is de werker daarna echt ingepland, dan is
// zijn wachtende reactie afgehandeld (stil), zodat het bedrijf geen reactie ziet van iemand die al op de klus staat.

const h = vi.hoisted(() => ({
  verified: false,
  matchUpserts: [] as unknown[],
  matchUpdates: [] as unknown[],
  kv: new Map<string, unknown>(),
  inplannen: vi.fn(async (_s: string, _f: string, _d: string) => ({ status: "ACCEPTED", shiftFilled: false } as { status: string; shiftFilled: boolean; pendingCompanyVerification?: boolean })),
}));

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
        user: { kycStatus: "VERIFIED", email: "sanne@voorbeeld.nl" },
      }),
    },
    shift: {
      findUnique: async () => ({
        id: "shift1",
        status: "OPEN",
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        breakMinutes: 0,
        positions: 1,
        viaUitzendbureau: false,
        visibility: "PUBLIC",
        title: "Bediening",
        hourlyRateCents: 1800,
        createdAt: new Date("2026-11-20T10:00:00Z"),
        branch: { tenantId: "t1", name: "Café Zuid", latitude: 52.1, longitude: 5.1, geofenceRadiusMeters: 150, tenant: { name: "Café BV" } },
        _count: { assignments: 0 },
      }),
    },
    shiftAssignment: { findUnique: async () => null, findFirst: async () => null },
    shiftMatch: {
      upsert: async (a: unknown) => void h.matchUpserts.push(a),
      update: async (a: unknown) => void h.matchUpdates.push(a),
    },
    user: { findUnique: async () => ({ fullName: "Sanne de Vries" }) },
  },
}));
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => h.kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void h.kv.set(k, v),
  kvListValues: async (prefix: string) => [...h.kv].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v),
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/company/verified", () => ({ isTenantVerified: async () => h.verified }));
vi.mock("@/lib/onboarding/werker-poort-server", () => ({ eisOnboardingVoorReageren: async () => undefined }));
vi.mock("@/lib/fiscal/eligibility", () => ({
  payoutEligibility: async () => ({ ok: true, track: "invoice", reason: null }),
  eisProefklusInSlot: vi.fn(),
}));
vi.mock("@/lib/uitzend/partners", () => ({ isUitzendPartnerTenant: async () => false }));
vi.mock("@/lib/employer/relations", () => ({ isBlockedByAny: async () => false }));
vi.mock("@/lib/pools/store", () => ({ isInvitedToPoolOnlyShift: async () => true }));
vi.mock("@/lib/admin/eigen-test", () => ({ leesEigenTest: async () => ({ tenants: {}, users: {} }) }));
vi.mock("@/lib/notifications/dispatcher", () => ({ recordOfferResponse: (s: string, f: string, d: string) => h.inplannen(s, f, d) }));

const { applyToShift } = await import("@/lib/matching/apply");
const { listCounterOffers, createCounterOffer } = await import("@/lib/offers/store");

beforeEach(() => {
  vi.clearAllMocks();
  h.verified = false;
  h.matchUpserts.length = 0;
  h.matchUpdates.length = 0;
  h.kv.clear();
});

describe("applyToShift bij een bedrijf dat nog niet is gecontroleerd", () => {
  it("legt de reactie vast: match op VIEWED zonder verloopmoment, een wachtende reactie bij het bedrijf, en er wordt niemand ingepland", async () => {
    const uit = await applyToShift("u1", "shift1");

    expect(uit).toEqual({ status: "VIEWED", shiftFilled: false, pendingCompanyVerification: true });
    expect(h.matchUpdates).toEqual([{ where: { shiftId_freelancerId: { shiftId: "shift1", freelancerId: "fp1" } }, data: { status: "VIEWED", expiresAt: null } }]);
    expect(h.inplannen).not.toHaveBeenCalled();
    const reacties = await listCounterOffers();
    expect(reacties).toHaveLength(1);
    expect(reacties[0]).toMatchObject({ userId: "u1", shiftId: "shift1", freelancerName: "Sanne de Vries", status: "pending", listedRateCents: 1800, proposedRateCents: 1800, branch: "Café Zuid" });
  });

  it("een tweede keer tikken maakt geen tweede reactie; een reactie met eigen tarief blijft staan (ook via de vaste schil)", async () => {
    await createCounterOffer({ userId: "u1", freelancerName: "Sanne de Vries", shiftId: "shift1", shiftTitle: "Bediening", branch: "Café Zuid", listedRateCents: 1800, proposedRateCents: 2000, note: "Vanaf 10 uur" });
    await applyToShift("u1", "shift1");
    await applyToShift("u1", "shift1");
    const reacties = await listCounterOffers();
    expect(reacties).toHaveLength(1);
    expect(reacties[0]).toMatchObject({ proposedRateCents: 2000, note: "Vanaf 10 uur", status: "pending" });
  });

  it("een storing bij het wegschrijven van de reactie verliest hem niet: de match staat al op VIEWED en de werker krijgt het antwoord", async () => {
    const kv = h.kv;
    const kvSet = vi.spyOn(kv, "set").mockImplementation(() => {
      throw new Error("kv stuk");
    });
    await expect(applyToShift("u1", "shift1")).resolves.toMatchObject({ status: "VIEWED", pendingCompanyVerification: true });
    expect(h.matchUpdates).toHaveLength(1);
    kvSet.mockRestore();
  });
});

describe("applyToShift bij een gecontroleerd bedrijf", () => {
  it("plant in zoals altijd en handelt een wachtende reactie van deze werker stil af", async () => {
    // eerst wachtte zijn reactie op het bedrijf, daarna is het bedrijf gecontroleerd en tikte hij zelf op Aannemen
    await applyToShift("u1", "shift1");
    expect((await listCounterOffers())[0]).toMatchObject({ status: "pending" });
    h.verified = true;

    const uit = await applyToShift("u1", "shift1");

    expect(uit).toEqual({ status: "ACCEPTED", shiftFilled: false });
    expect(h.inplannen).toHaveBeenCalledWith("shift1", "fp1", "ACCEPTED");
    const [reactie] = await listCounterOffers();
    expect(reactie).toMatchObject({ status: "accepted", respondedAt: null });
  });

  it("zonder wachtende reactie maakt het er ook geen", async () => {
    h.verified = true;
    await applyToShift("u1", "shift1");
    expect(await listCounterOffers()).toEqual([]);
  });
});
