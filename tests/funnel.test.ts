import { afterEach, describe, expect, it, vi } from "vitest";

const kv: Record<string, unknown> = {};
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv[k] ?? null,
  kvSet: async (k: string, v: unknown) => void (kv[k] = v),
}));

import { funnelReport, recordFunnel } from "@/lib/analytics/funnel";

afterEach(() => {
  for (const k of Object.keys(kv)) delete kv[k];
});

describe("funnel tracking", () => {
  it("counts steps and computes conversion + drop-off per step", async () => {
    for (let i = 0; i < 100; i++) await recordFunnel("onboarding-werknemer", "aangemeld");
    for (let i = 0; i < 60; i++) await recordFunnel("onboarding-werknemer", "verificatie-gestart");
    for (let i = 0; i < 50; i++) await recordFunnel("onboarding-werknemer", "verificatie-foto");
    for (let i = 0; i < 40; i++) await recordFunnel("onboarding-werknemer", "verificatie-klaar");

    const r = (await funnelReport("onboarding-werknemer", 1))!;
    const byKey = Object.fromEntries(r.steps.map((s) => [s.key, s]));
    expect(byKey["aangemeld"]!.count).toBe(100);
    expect(byKey["aangemeld"]!.conversion).toBe(1);
    expect(byKey["verificatie-gestart"]!.count).toBe(60);
    expect(byKey["verificatie-gestart"]!.conversion).toBe(0.6);
    expect(byKey["verificatie-klaar"]!.count).toBe(40);
    expect(byKey["verificatie-klaar"]!.dropoff).toBeCloseTo(0.2, 2); // 40/50
    expect(byKey["eerste-reactie"]!.count).toBe(0);
  });

  it("ignores unknown funnels and steps", async () => {
    await recordFunnel("nope", "aangemeld");
    await recordFunnel("onboarding-werknemer", "verzonnen-stap");
    const r = (await funnelReport("onboarding-werknemer", 1))!;
    expect(r.steps.every((s) => s.count === 0)).toBe(true);
    expect(await funnelReport("nope", 1)).toBeNull();
  });
});
