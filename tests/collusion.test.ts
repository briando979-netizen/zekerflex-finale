import { afterEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { timesheet: { findMany: (...a: unknown[]) => findMany(...a) } } }));

import { analyseCollusion } from "@/lib/fraud/collusion";

const NOW = Date.now();
const DAY = 86_400_000;

function ts(over: {
  tenantId: string;
  tenantName?: string;
  freelancerId: string;
  worker?: string;
  rate?: number;
  minutes?: number;
  checkin?: boolean;
  instant?: boolean;
  tenantAgeDays?: number;
  workerAgeDays?: number;
}) {
  const submitted = new Date(NOW - 2 * DAY);
  return {
    billableMinutes: over.minutes ?? 480,
    submittedAt: submitted,
    approvedAt: new Date(submitted.getTime() + (over.instant ? 60_000 : 2 * DAY)),
    scheduledStart: new Date(NOW - 3 * DAY),
    freelancerId: over.freelancerId,
    freelancer: { user: { fullName: over.worker ?? "Worker", createdAt: new Date(NOW - (over.workerAgeDays ?? 400) * DAY) } },
    assignment: { shift: { hourlyRateCents: over.rate ?? 2500 } },
    branch: { tenantId: over.tenantId, tenant: { name: over.tenantName ?? "Co", createdAt: new Date(NOW - (over.tenantAgeDays ?? 400) * DAY) } },
    gpsEvents: over.checkin === false ? [] : [{ type: "CHECK_IN" }],
  };
}

afterEach(() => vi.clearAllMocks());

describe("analyseCollusion", () => {
  it("flags a mutually-exclusive new pair with no check-ins and instant approvals", async () => {
    // 6 shifts, same tenant+worker, new accounts, no checkin, instant approval, high value
    findMany.mockResolvedValue(
      Array.from({ length: 6 }, () =>
        ts({ tenantId: "t1", tenantName: "ShadyBV", freelancerId: "f1", worker: "Mr X", checkin: false, instant: true, tenantAgeDays: 10, workerAgeDays: 8, rate: 4000, minutes: 480 }),
      ),
    );
    const [pair, ...rest] = await analyseCollusion({ minScore: 50 });
    expect(rest).toHaveLength(0);
    expect(pair!.bedrijf).toBe("ShadyBV");
    expect(pair!.werknemerConcentratie).toBe(1);
    expect(pair!.klantConcentratie).toBe(1);
    expect(pair!.nieuwePartij).toBe(true);
    expect(pair!.score).toBeGreaterThanOrEqual(70);
    expect(pair!.signalen.map((s) => s.code)).toContain("wederzijdse-exclusiviteit");
    expect(pair!.signalen.map((s) => s.code)).toContain("geen-checkin");
  });

  it("does not flag a normal established pair (check-ins, old accounts, diversified)", async () => {
    findMany.mockResolvedValue([
      // worker f1 also works a lot for t2 → not exclusive; check-ins present; old accounts
      ...Array.from({ length: 5 }, () => ts({ tenantId: "t1", freelancerId: "f1" })),
      ...Array.from({ length: 5 }, () => ts({ tenantId: "t2", freelancerId: "f1" })),
    ]);
    expect(await analyseCollusion({ minScore: 50 })).toHaveLength(0);
  });

  it("ignores pairs below the volume floor", async () => {
    findMany.mockResolvedValue([ts({ tenantId: "t1", freelancerId: "f1", checkin: false, instant: true, tenantAgeDays: 5, workerAgeDays: 5 })]);
    expect(await analyseCollusion({ minScore: 50 })).toHaveLength(0); // only 1 shift
  });
});
