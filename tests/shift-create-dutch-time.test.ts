import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Het formulier "Nieuwe dienst" stuurt datetime-local-waarden ("2027-01-10T09:00",
// zonder zone) naar de server. Die draait in UTC, dus `new Date()` maakte van 09:00
// 09:00 UTC = 10:00 in Nederland (zomer: 11:00). Extra dagen van een reeks hielden
// dezelfde UTC-tijd, en verschoven over de wisseling van zomer- naar wintertijd.

const ORIGINAL_TZ = process.env.TZ;
// Tijdbom (12 nov): de dienst op 10 januari 2027 moet "in de toekomst" liggen. Vanaf die dag faalde de test en hield
// hij elke uitrol tegen (de live-zetter draait vitest related). Daarom staat de klok hier vast.
beforeAll(() => {
  process.env.TZ = "UTC";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-01T12:00:00+01:00"));
});
afterAll(() => {
  vi.useRealTimers();
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const shiftCreate = vi.fn(async (args: { data: { startsAt: Date } }) => ({ id: `s-${args.data.startsAt.toISOString()}` }));
vi.mock("@/lib/company/verified", () => ({ isTenantVerified: async () => true, assertMayPlaceShift: async () => ({ test: false }), UNVERIFIED_ASSIGN_MESSAGE: "x" }));
vi.mock("@/lib/dashboard/employer", () => ({ resolveEmployerScope: async () => ({ tenantIds: ["t1"], branchIds: null }) }));
vi.mock("@/lib/audit", () => ({ recordAudit: async () => undefined }));
vi.mock("@/lib/matching/engine", () => ({ runMatchingForShift: async () => ({ rankedCount: 0 }) }));
vi.mock("@/lib/pools/store", () => ({ listPools: async () => [] }));
vi.mock("@/lib/worker/follows", () => ({ notifyFollowersOfShifts: async () => 0 }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    branch: { findFirst: async () => ({ id: "b1", name: "Hal 1", matchingConfig: {}, tenantId: "t1" }) },
    $transaction: (fn: (tx: unknown) => unknown) =>
      fn({ shift: { create: (a: { data: { startsAt: Date } }) => shiftCreate(a) }, shiftPoolInvite: { createMany: async () => undefined } }),
  },
}));

import { parseAmsterdamLocal } from "@/lib/time/amsterdam";
import { createShift } from "@/lib/shifts/create";

describe("parseAmsterdamLocal", () => {
  it("leest een tijd zonder zone als Nederlandse tijd, winter en zomer", () => {
    expect(parseAmsterdamLocal("2027-01-10T09:00").toISOString()).toBe("2027-01-10T08:00:00.000Z");
    expect(parseAmsterdamLocal("2027-07-01T09:00").toISOString()).toBe("2027-07-01T07:00:00.000Z");
    expect(parseAmsterdamLocal("2027-07-01T09:00:30").toISOString()).toBe("2027-07-01T07:00:30.000Z");
  });

  it("laat een tijd mét zone zoals hij is", () => {
    expect(parseAmsterdamLocal("2027-01-10T09:00:00Z").toISOString()).toBe("2027-01-10T09:00:00.000Z");
    expect(parseAmsterdamLocal("2027-01-10T09:00:00+01:00").toISOString()).toBe("2027-01-10T08:00:00.000Z");
  });
});

describe("createShift — Nederlandse tijd op een UTC-server", () => {
  it("maakt van 09:00–17:00 in het formulier ook 09:00–17:00 in Nederland", async () => {
    shiftCreate.mockClear();
    await createShift({ userId: "u1", email: "a@example.com" } as never, {
      branchId: "b1",
      title: "Magazijn",
      startsAt: "2027-01-10T09:00",
      endsAt: "2027-01-10T17:00",
      hourlyRateCents: 1700,
      breakMinutes: 30,
      positions: 1,
      viaUitzendbureau: false,
    });
    const data = shiftCreate.mock.calls[0]?.[0].data as { startsAt: Date; endsAt: Date };
    expect(data.startsAt.toISOString()).toBe("2027-01-10T08:00:00.000Z");
    expect(data.endsAt.toISOString()).toBe("2027-01-10T16:00:00.000Z");
  });

  it("houdt bij een reeks over de wisseling naar wintertijd overal 09:00 aan", async () => {
    shiftCreate.mockClear();
    // zo 31 okt 2027 eindigt de zomertijd
    await createShift({ userId: "u1", email: "a@example.com" } as never, {
      branchId: "b1",
      title: "Magazijn",
      startsAt: "2027-10-29T09:00",
      endsAt: "2027-10-29T17:00",
      hourlyRateCents: 1700,
      breakMinutes: 30,
      positions: 1,
      viaUitzendbureau: false,
      extraDates: ["2027-11-01", "2027-10-29"],
    });
    const starts = shiftCreate.mock.calls.map((c) => (c[0].data as { startsAt: Date }).startsAt.toISOString());
    expect(starts).toEqual(["2027-10-29T07:00:00.000Z", "2027-11-01T08:00:00.000Z"]); // allebei 09:00 NL, dubbele dag één keer
  });
});
