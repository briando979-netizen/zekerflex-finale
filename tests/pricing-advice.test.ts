import { afterEach, describe, expect, it, vi } from "vitest";

const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
}));
const findMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { shift: { findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock("@/lib/env", () => ({ env: { MIN_SHIFT_RATE_CENTS: 1620 } }));

import { fillForecast, marketStats } from "@/lib/pricing/advice";

// 20 "vakkenvuller" shifts at €16,50, half filled → baseFill 0.5, median 1650
function sample() {
  return Array.from({ length: 20 }, (_, i) => ({
    title: "Vakkenvuller",
    hourlyRateCents: 1650,
    positions: 1,
    requiredSkill: null,
    assignments: i < 10 ? [{ id: "a" }] : [],
  }));
}

afterEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(kv)) delete kv[k];
});

describe("marketStats", () => {
  it("computes median rate and fill rate per category", async () => {
    findMany.mockResolvedValue(sample());
    const s = await marketStats(true);
    expect(s.medianByCategory["supermarkt"] ?? s.overallMedian).toBe(1650);
    expect(s.overallFill).toBeCloseTo(0.5, 1);
    expect(s.sample).toBe(20);
  });
});

describe("fillForecast", () => {
  it("raises the fill chance as the rate rises above market", async () => {
    findMany.mockResolvedValue(sample());
    const monday = "2026-10-26T10:00:00Z"; // daytime weekday
    const atMarket = await fillForecast({ title: "Vakkenvuller", startsAt: monday, rateCents: 1650 });
    const above = await fillForecast({ title: "Vakkenvuller", startsAt: monday, rateCents: 2100 });
    expect(above.fillChance).toBeGreaterThan(atMarket.fillChance);
    expect(above.marketRateCents).toBe(1650);
  });

  it("suggests a higher rate when the chance is below target, and the suggestion lifts it", async () => {
    findMany.mockResolvedValue(sample());
    const fridayEve = "2026-10-23T20:00:00Z"; // harder slot
    const f = await fillForecast({ title: "Vakkenvuller", startsAt: fridayEve, rateCents: 1650 });
    expect(f.suggestedRateCents).toBeGreaterThan(1650);
    expect(f.suggestedFillChance).toBeGreaterThan(f.fillChance);
    expect(f.reasons.join(" ")).toMatch(/lastiger|stijgt/i);
  });
});
