import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(), kvSet: vi.fn() }));

import { rateVsMarket, type MarketStats } from "@/lib/pricing/advice";

const stats = (median: number, count?: number): MarketStats => ({
  medianByCategory: { horeca: median },
  fillByCategory: { horeca: 0.8 },
  ...(count !== undefined ? { countByCategory: { horeca: count } } : {}),
  overallMedian: median,
  overallFill: 0.8,
  sample: 100,
  computedAt: new Date().toISOString(),
});

describe("rateVsMarket", () => {
  it("geeft het verschil met de mediaan in hele procenten", () => {
    expect(rateVsMarket(1800, stats(1500, 20), "horeca")).toBe(20);
    expect(rateVsMarket(1350, stats(1500, 20), "horeca")).toBe(-10);
    expect(rateVsMarket(1500, stats(1500, 20), "horeca")).toBe(0);
  });

  it("zegt niets bij te weinig vergelijkingsmateriaal of oude cache", () => {
    expect(rateVsMarket(1800, stats(1500, 7), "horeca")).toBeNull();
    expect(rateVsMarket(1800, stats(1500), "horeca")).toBeNull(); // cache zonder aantallen
    expect(rateVsMarket(1800, stats(1500, 20), "logistiek")).toBeNull();
    expect(rateVsMarket(1800, null, "horeca")).toBeNull();
  });
});
