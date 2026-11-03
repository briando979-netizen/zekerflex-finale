import { afterEach, describe, expect, it, vi } from "vitest";

const profileFindMany = vi.fn();
const profileUpdate = vi.fn();
const timesheetGroupBy = vi.fn();
const matchGroupBy = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: {
      findMany: (...a: unknown[]) => profileFindMany(...a),
      update: (...a: unknown[]) => profileUpdate(...a),
    },
    timesheet: { groupBy: (...a: unknown[]) => timesheetGroupBy(...a) },
    shiftMatch: { groupBy: (...a: unknown[]) => matchGroupBy(...a) },
  },
}));

const reviewSummary = vi.fn();
vi.mock("@/lib/reviews/store", () => ({ reviewSummary: (...a: unknown[]) => reviewSummary(...a) }));

import { acceptanceRate, badgeForWork, syncWorkerStats, workXp } from "@/lib/worker/stats-sync";

afterEach(() => vi.clearAllMocks());

describe("badgeForWork", () => {
  it("volgt de niveaus uit de beloningen, alleen op werk", () => {
    expect(badgeForWork(0, 0, 0)).toBe("BRONZE");
    expect(badgeForWork(5, 0, 0)).toBe("BRONZE"); // 500 XP = Brons
    expect(badgeForWork(15, 0, 0)).toBe("SILVER"); // 1500 XP = Zilver
    expect(badgeForWork(40, 0, 0)).toBe("GOLD"); // 4000 XP = Goud
    expect(badgeForWork(100, 0, 0)).toBe("PLATINUM"); // 10.000 XP = Platina
    expect(badgeForWork(250, 0, 0)).toBe("PLATINUM"); // Diamant → hoogste badge
  });

  it("reviews en topbeoordeling tellen mee", () => {
    expect(workXp(10, 8, 4.9)).toBe(1000 + 200 + 500);
    expect(workXp(10, 8, 4.7)).toBe(1200);
    expect(badgeForWork(10, 8, 4.9)).toBe("SILVER");
    expect(workXp(10, 4, 5)).toBe(1100); // te weinig reviews voor topbeoordeeld
  });
});

describe("acceptanceRate", () => {
  it("trekt een korte historie naar 0,5 en volgt een lange", () => {
    expect(acceptanceRate(0, 0)).toBe(0.5);
    expect(acceptanceRate(1, 1)).toBe(0.6); // (1+2)/(1+4)
    expect(acceptanceRate(0, 1)).toBe(0.4);
    expect(acceptanceRate(90, 100)).toBe(0.88); // (90+2)/104
    expect(acceptanceRate(0, 100)).toBe(0.02);
  });
});

describe("syncWorkerStats", () => {
  it("schrijft diensten, acceptatie en badge alleen als er iets verandert", async () => {
    profileFindMany.mockResolvedValue([
      { id: "a", badgeLevel: "BRONZE", shiftsCompleted: 0, acceptanceScore: 0.5 }, // 45 diensten, 9/10 geaccepteerd
      { id: "b", badgeLevel: "BRONZE", shiftsCompleted: 0, acceptanceScore: 0.5 }, // nieuw: niets te doen
      { id: "c", badgeLevel: "PLATINUM", shiftsCompleted: 20, acceptanceScore: 0.5 }, // badge omlaag, geen aanbiedingen
    ]);
    timesheetGroupBy.mockResolvedValue([
      { freelancerId: "a", _count: { _all: 45 } },
      { freelancerId: "c", _count: { _all: 20 } },
    ]);
    matchGroupBy.mockResolvedValue([
      { freelancerId: "a", status: "ACCEPTED", _count: { _all: 9 } },
      { freelancerId: "a", status: "DECLINED", _count: { _all: 1 } },
    ]);
    reviewSummary.mockImplementation(async (_t: string, id: string) => (id === "b" ? Promise.reject(new Error("kv weg")) : { average: 4, count: 2 }));

    const r = await syncWorkerStats(new Date("2026-11-03T10:00:00Z"));
    expect(r).toEqual({ checked: 3, changed: 2, badgeUp: 1, badgeDown: 1 });
    expect(profileUpdate).toHaveBeenCalledWith({ where: { id: "a" }, data: { shiftsCompleted: 45, acceptanceScore: 0.79, badgeLevel: "GOLD" } });
    // geen beantwoorde aanbiedingen → acceptatie blijft wat hij was
    expect(profileUpdate).toHaveBeenCalledWith({ where: { id: "c" }, data: { shiftsCompleted: 20, acceptanceScore: 0.5, badgeLevel: "SILVER" } });

    expect(timesheetGroupBy.mock.calls[0]![0].where).toEqual({ status: { in: ["APPROVED", "PAID"] } });
    const mw = matchGroupBy.mock.calls[0]![0].where;
    expect(mw.notifiedAt).toEqual({ not: null });
    expect(mw.status.in).toEqual(["ACCEPTED", "DECLINED", "EXPIRED"]);
    expect(mw.createdAt.gte.toISOString()).toBe("2025-11-03T10:00:00.000Z");
  });
});
