import { afterEach, describe, expect, it, vi } from "vitest";

// Eén werker kan niet op twee plekken tegelijk zijn. De automatische matching
// sloeg zulke werkers al over, maar zelf aannemen, een aanbod accepteren en
// reageren lieten een tweede, overlappende dienst gewoon toe.

const freelancerProfileFindUnique = vi.fn();
const shiftFindUnique = vi.fn();
const shiftMatchUpsert = vi.fn();
const shiftAssignmentFindUnique = vi.fn(async (): Promise<unknown> => null);
const shiftAssignmentFindFirst = vi.fn(async (..._a: unknown[]): Promise<unknown> => null);
vi.mock("@/lib/company/verified", () => ({ isTenantVerified: async () => true, UNVERIFIED_ASSIGN_MESSAGE: "x" }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: (...a: unknown[]) => freelancerProfileFindUnique(...a) },
    shift: { findUnique: (...a: unknown[]) => shiftFindUnique(...a) },
    shiftMatch: { upsert: (...a: unknown[]) => shiftMatchUpsert(...a) },
    shiftAssignment: {
      findUnique: () => shiftAssignmentFindUnique(),
      findFirst: (...a: unknown[]) => shiftAssignmentFindFirst(...a),
    },
  },
}));
vi.mock("@/lib/fiscal/eligibility", () => ({ payoutEligibility: async () => ({ ok: true, track: "invoice", reason: null }) }));
vi.mock("@/lib/employer/relations", () => ({ isBlockedByAny: async () => false }));
vi.mock("@/lib/pools/store", () => ({ isInvitedToPoolOnlyShift: async () => false }));
const recordOfferResponse = vi.fn(async () => ({ status: "ACCEPTED", shiftFilled: false }));
vi.mock("@/lib/notifications/dispatcher", () => ({ recordOfferResponse: () => recordOfferResponse() }));

import {
  findOverlappingShift,
  overlapMessageOther,
  overlapMessageSelf,
  overlapWhen,
  overlapsAny,
  restViolation,
} from "@/lib/shifts/worker-overlap";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { applyToShift } from "@/lib/matching/apply";
import { AppError } from "@/lib/errors";

const OTHER_ROW = {
  shift: {
    id: "other1",
    title: "Afwasser",
    startsAt: new Date("2026-11-04T10:00:00Z"),
    endsAt: new Date("2026-11-04T14:00:00Z"),
    branch: { name: "Restaurant De Haven" },
  },
};

afterEach(() => vi.clearAllMocks());

describe("findOverlappingShift", () => {
  it("zoekt alleen niet-geannuleerde diensten die echt overlappen, zonder de dienst zelf", async () => {
    shiftAssignmentFindFirst.mockResolvedValueOnce(OTHER_ROW);
    const startsAt = new Date("2026-11-04T08:00:00Z");
    const endsAt = new Date("2026-11-04T16:00:00Z");
    const { prisma } = await import("@/lib/prisma");

    const hit = await findOverlappingShift(prisma as never, "fp1", { shiftId: "shift1", startsAt, endsAt });

    expect(hit).toEqual({
      shiftId: "other1",
      title: "Afwasser",
      branch: "Restaurant De Haven",
      startsAt: OTHER_ROW.shift.startsAt,
      endsAt: OTHER_ROW.shift.endsAt,
    });
    const arg = shiftAssignmentFindFirst.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(arg.where).toEqual({
      freelancerId: "fp1",
      cancelledAt: null,
      shiftId: { not: "shift1" },
      // strikt kleiner/groter: een dienst die om 16:00 begint sluit aan, en botst niet
      shift: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
    });
  });

  it("geeft null als er niets overlapt", async () => {
    const { prisma } = await import("@/lib/prisma");
    const hit = await findOverlappingShift(prisma as never, "fp1", { shiftId: "s", startsAt: new Date(), endsAt: new Date() });
    expect(hit).toBeNull();
  });
});

describe("overlapsAny (de lijst met klussen)", () => {
  const mine = [{ startsAt: new Date("2026-11-04T08:00:00Z"), endsAt: new Date("2026-11-04T16:00:00Z") }];
  const at = (from: string, to: string) => ({ startsAt: new Date(from), endsAt: new Date(to) });

  it("ziet een gedeeltelijke of volledige overlap", () => {
    expect(overlapsAny(mine, at("2026-11-04T15:00:00Z", "2026-11-04T20:00:00Z"))).toBe(true);
    expect(overlapsAny(mine, at("2026-11-04T09:00:00Z", "2026-11-04T10:00:00Z"))).toBe(true);
    expect(overlapsAny(mine, at("2026-11-04T06:00:00Z", "2026-11-04T18:00:00Z"))).toBe(true);
  });

  it("laat aansluitende diensten en andere dagen vrij", () => {
    expect(overlapsAny(mine, at("2026-11-04T16:00:00Z", "2026-11-04T20:00:00Z"))).toBe(false);
    expect(overlapsAny(mine, at("2026-11-04T04:00:00Z", "2026-11-04T08:00:00Z"))).toBe(false);
    expect(overlapsAny(mine, at("2026-11-05T08:00:00Z", "2026-11-05T16:00:00Z"))).toBe(false);
    expect(overlapsAny([], at("2026-11-04T08:00:00Z", "2026-11-04T16:00:00Z"))).toBe(false);
  });
});

describe("restViolation (Arbeidstijdenwet: elke 24 uur 11 uur aaneengesloten rust)", () => {
  const at = (from: string, to: string) => ({ startsAt: new Date(from), endsAt: new Date(to) });

  it("laat een gebroken dienst op één dag (lunch en diner) met rust", () => {
    const lunch = at("2026-11-04T10:00:00Z", "2026-11-04T14:00:00Z");
    const diner = at("2026-11-04T17:00:00Z", "2026-11-04T22:00:00Z");
    expect(restViolation([lunch], diner)).toBeNull();
    expect(restViolation([diner], lunch)).toBeNull();
  });

  it("meldt een avonddienst gevolgd door een vroege dienst met maar 6 uur rust", () => {
    const avond = at("2026-11-04T16:00:00Z", "2026-11-05T00:00:00Z");
    const vroeg = at("2026-11-05T06:00:00Z", "2026-11-05T14:00:00Z");
    expect(restViolation([avond], vroeg)).toEqual(at("2026-11-04T16:00:00Z", "2026-11-05T14:00:00Z"));
  });

  it("volgt een keten van diensten, ook als de klus in het midden zit", () => {
    const a = at("2026-11-04T08:00:00Z", "2026-11-04T12:00:00Z");
    const klus = at("2026-11-04T15:00:00Z", "2026-11-04T19:00:00Z"); // 3 uur na a
    const c = at("2026-11-04T23:00:00Z", "2026-11-05T03:00:00Z"); // 4 uur na de klus
    expect(restViolation([c, a], klus)).toEqual(at("2026-11-04T08:00:00Z", "2026-11-05T03:00:00Z"));
  });

  it("zwijgt bij precies 11 uur rust, zonder andere diensten en bij een periode van 13 uur", () => {
    const klus = at("2026-11-04T08:00:00Z", "2026-11-04T16:00:00Z");
    expect(restViolation([at("2026-11-05T03:00:00Z", "2026-11-05T08:00:00Z")], klus)).toBeNull();
    expect(restViolation([], at("2026-11-04T06:00:00Z", "2026-11-04T21:00:00Z"))).toBeNull();
    expect(restViolation([at("2026-11-04T16:00:00Z", "2026-11-04T21:00:00Z")], klus)).toBeNull();
  });

  it("heeft in elke taal een zin met de periode erin", () => {
    expect(FREELANCER_DICTS.nl.detail.shortRest("wo 4 nov. 16:00 – do 5 nov. 15:00")).toBe(
      "Met deze klus werk je wo 4 nov. 16:00 – do 5 nov. 15:00 zonder 11 uur rust ertussen. De Arbeidstijdenwet vraagt in elke 24 uur minstens 11 uur aaneengesloten rust.",
    );
    for (const d of Object.values(FREELANCER_DICTS)) expect(d.detail.shortRest("PERIODE")).toContain("PERIODE");
  });
});

describe("meldingen", () => {
  const other = { shiftId: "o", title: "Afwasser", branch: "Restaurant De Haven", startsAt: OTHER_ROW.shift.startsAt, endsAt: OTHER_ROW.shift.endsAt };

  it("tonen Nederlandse tijd, ook in de wintertijd en de zomertijd", () => {
    expect(overlapWhen(other)).toBe("wo 4 nov 11:00–15:00");
    expect(overlapWhen({ startsAt: new Date("2026-07-01T07:00:00Z"), endsAt: new Date("2026-07-01T15:30:00Z") })).toBe("wo 1 jul 09:00–17:30");
  });

  it("noemen voor de werker zelf de andere dienst", () => {
    const m = overlapMessageSelf(other);
    expect(m).toContain("Afwasser bij Restaurant De Haven");
    expect(m).toContain("wo 4 nov 11:00–15:00");
  });

  it("verraden aan een werkgever niet bij wie de werker nog meer werkt", () => {
    const m = overlapMessageOther(other);
    expect(m).not.toContain("Restaurant De Haven");
    expect(m).not.toContain("Afwasser");
    expect(m).toContain("11:00–15:00");
  });
});

describe("applyToShift — dubbel geboekt", () => {
  const profile = {
    id: "fp1",
    kvkValid: true,
    isBlacklisted: false,
    matchingBlockedUntil: null,
    homeLatitude: 52.0,
    homeLongitude: 5.0,
    user: { kycStatus: "VERIFIED" },
  };
  const shift = {
    id: "shift1",
    status: "OPEN",
    startsAt: new Date(Date.now() + 86_400_000),
    endsAt: new Date(Date.now() + 86_400_000 + 8 * 3_600_000),
    positions: 1,
    viaUitzendbureau: false,
    visibility: "PUBLIC",
    branch: { tenantId: "org1", latitude: 52.1, longitude: 5.1, geofenceRadiusMeters: 500 },
    _count: { assignments: 0 },
  };

  it("weigert een dienst die overlapt met een dienst die je al hebt, vóórdat er een reactie wordt vastgelegd", async () => {
    freelancerProfileFindUnique.mockResolvedValue(profile);
    shiftFindUnique.mockResolvedValue(shift);
    shiftAssignmentFindFirst.mockResolvedValueOnce(OTHER_ROW);

    const err = await applyToShift("u1", "shift1").catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).message).toContain("Je staat dan al ingepland: Afwasser");
    expect(shiftMatchUpsert).not.toHaveBeenCalled();
    expect(recordOfferResponse).not.toHaveBeenCalled();
  });

  it("laat een dienst zonder overlap gewoon door", async () => {
    freelancerProfileFindUnique.mockResolvedValue(profile);
    shiftFindUnique.mockResolvedValue(shift);

    const result = await applyToShift("u1", "shift1");

    expect(result.status).toBe("ACCEPTED");
    expect(recordOfferResponse).toHaveBeenCalled();
  });
});
