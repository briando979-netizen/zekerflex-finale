import { describe, expect, it } from "vitest";
// @ts-expect-error — plain .mjs harness helper, no types
import { percentile, summarize } from "../tools/loadtest/stats.mjs";

describe("load-test stats", () => {
  it("computes percentiles with interpolation", () => {
    const xs = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(xs, 50)).toBeCloseTo(50.5, 1);
    expect(percentile(xs, 95)).toBeCloseTo(95.05, 1);
    expect(percentile(xs, 0)).toBe(1);
    expect(percentile(xs, 100)).toBe(100);
    expect(percentile([], 95)).toBe(0);
  });

  it("summarises samples into rate/throughput/latency", () => {
    const samples = [
      { latencyMs: 10, ok: true, status: 200 },
      { latencyMs: 20, ok: true, status: 200 },
      { latencyMs: 30, ok: false, status: 500 },
      { latencyMs: 40, ok: true, status: 200 },
    ];
    const s = summarize(samples, 1000);
    expect(s.requests).toBe(4);
    expect(s.errors).toBe(1);
    expect(s.errorRate).toBe(0.25);
    expect(s.throughputPerSec).toBe(4);
    expect(s.byStatus).toEqual({ 200: 3, 500: 1 });
    expect(s.max).toBe(40);
  });
});
