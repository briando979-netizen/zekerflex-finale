import { afterEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.fn();
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: {
    freelancerProfile: { findUnique: (...a: unknown[]) => findUnique(...a) },
    engagementEvent: { findMany: (...a: unknown[]) => findMany(...a) },
  },
}));

import { computeActiveHours } from "@/lib/engagement/events";

afterEach(() => vi.clearAllMocks());

const eventsAtHours = (hours: number[]) =>
  hours.map((h) => ({ occurredAt: new Date(Date.UTC(2026, 6, 10, h, 15, 0)) }));

describe("computeActiveHours", () => {
  it("returns null below the minimum sample size", async () => {
    findUnique.mockResolvedValue({ timezone: "UTC" });
    findMany.mockResolvedValue(eventsAtHours([18, 19, 20]));
    expect(await computeActiveHours("fp_1")).toBeNull();
  });

  it("learns the hours the freelancer is actually active", async () => {
    findUnique.mockResolvedValue({ timezone: "UTC" });
    // 30 evening events, 3 stray daytime ones
    const hours = [
      ...Array.from({ length: 10 }, () => 19),
      ...Array.from({ length: 10 }, () => 20),
      ...Array.from({ length: 10 }, () => 21),
      9,
      13,
      15,
    ];
    findMany.mockResolvedValue(eventsAtHours(hours));
    const active = await computeActiveHours("fp_1");
    expect(active).not.toBeNull();
    expect(active!.hours).toEqual([19, 20, 21]);
    expect(active!.sampleSize).toBe(33);
  });

  it("returns null for a uniform (degenerate) distribution", async () => {
    findUnique.mockResolvedValue({ timezone: "UTC" });
    const uniform: number[] = [];
    for (let round = 0; round < 3; round += 1) {
      for (let h = 0; h < 24; h += 1) uniform.push(h);
    }
    findMany.mockResolvedValue(eventsAtHours(uniform));
    expect(await computeActiveHours("fp_1")).toBeNull();
  });
});
