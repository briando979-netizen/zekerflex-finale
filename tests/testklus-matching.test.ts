import { afterEach, describe, expect, it, vi } from "vitest";

// Een testklus (lib/shifts/testklus.ts) ging als voorstel en push naar echte
// werkers: op 9 nov waren er 54 ongezien verlopen, en die trokken hun
// acceptatiescore omlaag. Nu krijgen alleen interne accounts een testklus
// aangeboden (lib/shifts/testklus-db.ts), in de matching én in de dispatcher.

type Args = { where: Record<string, unknown> };

const h = vi.hoisted(() => ({
  shiftFindUnique: vi.fn(),
  shiftFindUniqueOrThrow: vi.fn(),
  // Twee soorten vragen aan freelancerProfile: de interne ontvangers (where.user.OR)
  // en de rest (kandidatenpool, contactvensters).
  profileFindMany: vi.fn(async (a: Args): Promise<unknown[]> =>
    (a.where.user as { OR?: unknown } | undefined)?.OR ? [{ id: "f-intern", userId: "u-intern" }] : [],
  ),
  matchUpdateMany: vi.fn(async (_a: Args) => ({ count: 1 })),
  poolLeden: vi.fn(async (): Promise<string[]> => []),
  lpop: vi.fn(),
  sendShiftOffer: vi.fn(async (_o: unknown) => true),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    shift: {
      findUnique: (...a: unknown[]) => h.shiftFindUnique(...a),
      findUniqueOrThrow: (...a: unknown[]) => h.shiftFindUniqueOrThrow(...a),
      update: async () => ({}),
    },
    shiftAssignment: { count: async () => 0 },
    shiftMatch: { updateMany: (a: Args) => h.matchUpdateMany(a), createMany: async () => ({ count: 0 }) },
    freelancerProfile: { findMany: (a: Args) => h.profileFindMany(a) },
  },
}));
vi.mock("@/lib/redis", () => ({
  acquireLock: async () => async () => undefined,
  redis: {
    hgetall: async () => ({ waveSize: "5", offerTtlMinutes: "20", wave: "0", seats: "2" }),
    lpop: (...a: unknown[]) => h.lpop(...a),
    hset: async () => 1,
    zadd: async () => 1,
    del: async () => 1,
  },
}));
vi.mock("@/lib/pools/store", () => ({ invitedPoolMemberUserIds: () => h.poolLeden() }));
vi.mock("@/lib/company/verified", () => ({ isTenantVerified: async () => false, UNVERIFIED_ASSIGN_MESSAGE: "" }));
vi.mock("@/lib/matching/worker-prefs", () => ({
  loadWorkerPrefs: async () => new Map(),
  prefsAllowShift: () => true,
  prefsAllowTravel: () => true,
}));
vi.mock("@/lib/notifications/push", () => ({ sendShiftOffer: (o: unknown) => h.sendShiftOffer(o) }));
vi.mock("@/lib/notifications/klus-mail", () => ({ mailKlusVoorstel: async () => "verstuurd" }));

const { runMatchingForShift } = await import("@/lib/matching/engine");
const { dispatchNextWave } = await import("@/lib/notifications/dispatcher");
const { INTERNE_ADRESSEN } = await import("@/lib/shifts/testklus-db");

afterEach(() => vi.clearAllMocks());

const START = new Date("2026-12-01T09:00:00+01:00");
const END = new Date("2026-12-01T17:00:00+01:00");

function dienst(bedrijf: string, extra: Record<string, unknown> = {}) {
  return {
    id: "s1",
    title: "Orderpicker",
    status: "OPEN",
    positions: 2,
    visibility: "PUBLIC",
    requiredSkillId: null,
    minSkillRating: null,
    viaUitzendbureau: false,
    startsAt: START,
    endsAt: END,
    assignments: [],
    branch: { tenantId: "t1", tenant: { name: bedrijf }, matchingConfig: null, latitude: 52.1, longitude: 5.1, geofenceRadiusMeters: 150 },
    ...extra,
  };
}

/** De vraag van de kandidatenpool (niet die van de interne ontvangers). */
function poolVraag(): Args["where"] {
  const call = h.profileFindMany.mock.calls.find(([a]) => !(a.where.user as { OR?: unknown } | undefined)?.OR);
  if (!call) throw new Error("geen kandidatenpool geladen");
  return call[0].where;
}

describe("matching van een testklus", () => {
  it("laadt bij een testklus alleen interne accounts als kandidaat", async () => {
    h.shiftFindUnique.mockResolvedValueOnce(dienst("Test bedrijven"));
    await runMatchingForShift("s1");
    expect(poolVraag().userId).toEqual({ in: ["u-intern"] });

    // wie telt als intern: beheer en verkoop, leden van het eigen bedrijf, testadressen; nooit een gewist account
    const intern = h.profileFindMany.mock.calls.find(([a]) => (a.where.user as { OR?: unknown } | undefined)?.OR)![0].where.user as {
      disabledAt: unknown;
      OR: unknown[];
    };
    expect(intern.disabledAt).toBeNull();
    expect(intern.OR[0]).toEqual({ memberships: { some: { OR: [{ role: { in: ["PLATFORM_ADMIN", "SALES"] } }, { tenantId: "t1" }] } } });
    expect(intern.OR).toContainEqual({ email: { endsWith: ".test", mode: "insensitive" } });
    expect(intern.OR).toContainEqual({ email: { endsWith: "@zekerflex.com", mode: "insensitive" } });
    expect(intern.OR).toHaveLength(1 + INTERNE_ADRESSEN.length);
  });

  it("houdt bij een besloten testklus alleen de interne poolleden over", async () => {
    h.shiftFindUnique.mockResolvedValueOnce(dienst("Bakkerij Jansen", { title: "Bediening (testklus)", visibility: "POOL_ONLY" }));
    h.poolLeden.mockResolvedValueOnce(["u-echt", "u-intern"]);
    await runMatchingForShift("s1");
    expect(poolVraag().userId).toEqual({ in: ["u-intern"] });
  });

  it("laat een echte klus ongemoeid", async () => {
    h.shiftFindUnique.mockResolvedValueOnce(dienst("Bakkerij Jansen"));
    await runMatchingForShift("s1");
    expect(poolVraag().userId).toBeUndefined();
    expect(h.profileFindMany.mock.calls.some(([a]) => (a.where.user as { OR?: unknown } | undefined)?.OR)).toBe(false);
  });
});

describe("dispatcher bij een testklus", () => {
  const golf = [
    { freelancerId: "f-echt", score: 0.9, travelMinutes: 12, travelMode: "DRIVING" },
    { freelancerId: "f-intern", score: 0.8, travelMinutes: 20, travelMode: "DRIVING" },
  ].map((c) => JSON.stringify(c));

  function klaarzetten(bedrijf: string) {
    h.shiftFindUnique.mockResolvedValueOnce({ positions: 2, status: "OPEN" });
    h.shiftFindUniqueOrThrow.mockResolvedValueOnce({
      title: "Orderpicker",
      hourlyRateCents: 1650,
      branch: { name: "Magazijn", city: "Venlo", tenantId: "t1", tenant: { name: bedrijf } },
    });
    h.lpop.mockResolvedValueOnce(golf);
  }

  it("stuurt een testklus uit een oude wachtrij alleen naar interne accounts", async () => {
    klaarzetten("Test bedrijven");
    expect(await dispatchNextWave("s1")).toBe(1);
    expect(h.sendShiftOffer).toHaveBeenCalledTimes(1);
    expect(h.sendShiftOffer.mock.calls[0]).toEqual([expect.objectContaining({ freelancerId: "f-intern" })]);
    const gemeld = h.matchUpdateMany.mock.calls.map(([a]) => a.where.freelancerId);
    expect(gemeld).toEqual(["f-intern"]); // de echte werker blijft een stil voorstel
  });

  it("stuurt een echte klus naar iedereen in de golf", async () => {
    klaarzetten("Bakkerij Jansen");
    expect(await dispatchNextWave("s1")).toBe(2);
    expect(h.sendShiftOffer).toHaveBeenCalledTimes(2);
  });
});
