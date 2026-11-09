import { afterEach, describe, expect, it, vi } from "vitest";

const profileFindMany = vi.fn();
const profileUpdate = vi.fn();
const timesheetGroupBy = vi.fn();
const matchGroupBy = vi.fn();
const assignmentFindMany = vi.fn();
const timesheetFindMany = vi.fn();
// Geen testklussen, tenzij een test ze zelf opgeeft (lib/shifts/testklus-db.ts).
const shiftFindMany = vi.fn(async (..._a: unknown[]): Promise<unknown[]> => []);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: {
      findMany: (...a: unknown[]) => profileFindMany(...a),
      update: (...a: unknown[]) => profileUpdate(...a),
    },
    timesheet: {
      groupBy: (...a: unknown[]) => timesheetGroupBy(...a),
      findMany: (...a: unknown[]) => timesheetFindMany(...a),
    },
    shiftMatch: { groupBy: (...a: unknown[]) => matchGroupBy(...a) },
    shiftAssignment: { findMany: (...a: unknown[]) => assignmentFindMany(...a) },
    shift: { findMany: (...a: unknown[]) => shiftFindMany(...a) },
  },
}));

const kv = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (key: string) => kv.get(key) ?? null,
  kvSet: async (key: string, value: unknown) => {
    kv.set(key, value);
  },
}));

const sendUserPush = vi.fn().mockResolvedValue(1);
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: (...a: unknown[]) => sendUserPush(...a) }));

const reviewSummary = vi.fn();
vi.mock("@/lib/reviews/store", () => ({ reviewSummary: (...a: unknown[]) => reviewSummary(...a) }));

import { acceptanceRate, badgeForWork, missKind, reliabilityFrom, syncWorkerStats, workXp } from "@/lib/worker/stats-sync";

const NOW = new Date("2026-11-03T10:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 864e5);

afterEach(() => {
  vi.clearAllMocks();
  kv.clear();
});

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

describe("missKind", () => {
  it("herkent alleen de vaste begintekst, niet de vrije reden van de werker", () => {
    expect(missKind("Niet opgekomen (no-show, automatisch gedetecteerd)")).toBe("no-show");
    expect(missKind("Afgezegd door flexwerker (buiten de opzegtermijn): ziek")).toBe("late-cancel");
    expect(missKind("Afgezegd door flexwerker: dit valt buiten de opzegtermijn denk ik")).toBeNull();
    expect(missKind("Geannuleerd door opdrachtgever: regen")).toBeNull();
    expect(missKind("Vervangen via ZekerFlex (vrije vervanging)")).toBeNull();
    expect(missKind(null)).toBeNull();
  });
});

describe("reliabilityFrom", () => {
  it("trekt straffen af die per half jaar halveren en na twee jaar vervallen", () => {
    expect(reliabilityFrom([], NOW)).toBe(1);
    expect(reliabilityFrom([{ kind: "no-show", at: NOW }], NOW)).toBe(0.85);
    expect(reliabilityFrom([{ kind: "late-cancel", at: NOW }], NOW)).toBe(0.95);
    expect(reliabilityFrom([{ kind: "no-show", at: daysAgo(180) }], NOW)).toBe(0.93); // 0,15 × 0,5 = 0,075
    expect(reliabilityFrom([{ kind: "no-show", at: daysAgo(731) }], NOW)).toBe(1);
    const many = Array.from({ length: 10 }, () => ({ kind: "no-show" as const, at: NOW }));
    expect(reliabilityFrom(many, NOW)).toBe(0);
  });

  it("elke goed afgeronde dienst ná de misser telt mee voor herstel", () => {
    const miss = [{ kind: "no-show" as const, at: daysAgo(10) }];
    const before = [daysAgo(20), daysAgo(15)]; // vóór de misser: telt niet
    const after = (n: number) => Array.from({ length: n }, (_, i) => daysAgo(9 - i));
    const r0 = reliabilityFrom(miss, NOW, before);
    const r1 = reliabilityFrom(miss, NOW, [...before, ...after(1)]);
    const r3 = reliabilityFrom(miss, NOW, after(3));
    expect(r1).toBeGreaterThan(r0);
    expect(1 - r3).toBeCloseTo((1 - r0) / 2, 2); // 3 diensten = straf half
  });
});

describe("syncWorkerStats", () => {
  it("schrijft diensten, acceptatie, badge en betrouwbaarheid alleen als er iets verandert", async () => {
    profileFindMany.mockResolvedValue([
      { id: "a", userId: "ua", badgeLevel: "BRONZE", shiftsCompleted: 0, acceptanceScore: 0.5, reliabilityScore: 1 }, // 45 diensten, 9/10 geaccepteerd
      { id: "b", userId: "ub", badgeLevel: "BRONZE", shiftsCompleted: 0, acceptanceScore: 0.5, reliabilityScore: 1 }, // nieuw: niets te doen
      { id: "c", userId: "uc", badgeLevel: "PLATINUM", shiftsCompleted: 20, acceptanceScore: 0.5, reliabilityScore: 0.7 }, // badge omlaag, oude no-show herstelt deels
    ]);
    assignmentFindMany.mockResolvedValue([{ freelancerId: "c", cancelledAt: daysAgo(180), cancelReason: "Niet opgekomen (no-show, automatisch gedetecteerd)" }]);
    // c werkte daarna 3 diensten goed af
    timesheetFindMany.mockResolvedValue([daysAgo(100), daysAgo(50), daysAgo(5)].map((d) => ({ freelancerId: "c", scheduledStart: d })));
    timesheetGroupBy.mockResolvedValue([
      { freelancerId: "a", _count: { _all: 45 } },
      { freelancerId: "c", _count: { _all: 20 } },
    ]);
    matchGroupBy.mockResolvedValue([
      { freelancerId: "a", status: "ACCEPTED", _count: { _all: 9 } },
      { freelancerId: "a", status: "DECLINED", _count: { _all: 1 } },
    ]);
    reviewSummary.mockImplementation(async (_t: string, id: string) => (id === "b" ? Promise.reject(new Error("kv weg")) : { average: 4, count: 2 }));

    const r = await syncWorkerStats(NOW);
    expect(r).toEqual({ checked: 3, changed: 2, badgeUp: 1, badgeDown: 1 });
    // alleen wie stijgt krijgt een felicitatie, één keer per niveau
    expect(sendUserPush).toHaveBeenCalledTimes(1);
    expect(sendUserPush.mock.calls[0]![0]).toEqual(["ua"]);
    expect(sendUserPush.mock.calls[0]![1].title).toContain("Goud");
    expect(kv.has("badge-push:ua:GOLD")).toBe(true);
    expect(profileUpdate).toHaveBeenCalledWith({ where: { id: "a" }, data: { shiftsCompleted: 45, acceptanceScore: 0.79, badgeLevel: "GOLD", reliabilityScore: 1 } });
    // geen beantwoorde aanbiedingen → acceptatie blijft wat hij was; no-show van een half jaar
    // geleden (× 0,5) met 3 goede diensten erna (× 0,5): 1 − 0,15 × 0,25 = 0,96
    expect(profileUpdate).toHaveBeenCalledWith({ where: { id: "c" }, data: { shiftsCompleted: 20, acceptanceScore: 0.5, badgeLevel: "SILVER", reliabilityScore: 0.96 } });
    expect(timesheetFindMany.mock.calls[0]![0].where.freelancerId).toEqual({ in: ["c"] });

    // zakt "a" later en stijgt hij weer naar Goud: geen tweede felicitatie
    sendUserPush.mockClear();
    profileFindMany.mockResolvedValue([{ id: "a", userId: "ua", badgeLevel: "SILVER", shiftsCompleted: 45, acceptanceScore: 0.79, reliabilityScore: 1 }]);
    await syncWorkerStats(NOW);
    expect(sendUserPush).not.toHaveBeenCalled();

    const aw = assignmentFindMany.mock.calls[0]![0].where;
    expect(aw.cancelledAt.gte.toISOString()).toBe("2024-11-03T10:00:00.000Z");
    expect(aw.OR).toEqual([{ cancelReason: { startsWith: "Niet opgekomen" } }, { cancelReason: { startsWith: "Afgezegd door flexwerker (buiten de opzegtermijn)" } }]);

    expect(timesheetGroupBy.mock.calls[0]![0].where).toEqual({ status: { in: ["APPROVED", "PAID"] } });
    const mw = matchGroupBy.mock.calls[0]![0].where;
    expect(mw.notifiedAt).toEqual({ not: null });
    expect(mw.status.in).toEqual(["ACCEPTED", "DECLINED", "EXPIRED"]);
    expect(mw.createdAt.gte.toISOString()).toBe("2025-11-03T10:00:00.000Z");
    expect(mw.shiftId).toBeUndefined(); // geen testklussen: geen extra filter
  });

  it("telt voorstellen voor een testklus niet mee in de acceptatie", async () => {
    profileFindMany.mockResolvedValue([]);
    timesheetGroupBy.mockResolvedValue([]);
    matchGroupBy.mockResolvedValue([]);
    assignmentFindMany.mockResolvedValue([]);
    shiftFindMany.mockResolvedValueOnce([
      { id: "s-test", title: "Orderpicker", branch: { tenant: { name: "Test bedrijven" } } },
      { id: "s-titel", title: "Bediening (testklus)", branch: { tenant: { name: "Bakkerij Jansen" } } },
      { id: "s-echt", title: "Testmonteur", branch: { tenant: { name: "Volvo" } } }, // "test" in de titel, toch echt werk
    ]);

    await syncWorkerStats(NOW);
    const sw = shiftFindMany.mock.calls[0]![0] as { where: { startsAt: { gte: Date } } };
    expect(sw.where.startsAt.gte.toISOString()).toBe("2025-11-03T10:00:00.000Z");
    expect(matchGroupBy.mock.calls[0]![0].where.shiftId).toEqual({ notIn: ["s-test", "s-titel"] });
  });
});
