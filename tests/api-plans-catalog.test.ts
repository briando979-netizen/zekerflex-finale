import { describe, expect, it } from "vitest";
import { API_PLANS, PLAN_KEYS, getPlan, isPlanKey } from "@/lib/api-plans/catalog";

describe("API_PLANS", () => {
  it("defines every plan key with sane invariants", () => {
    for (const key of PLAN_KEYS) {
      const plan = API_PLANS[key];
      expect(plan.key).toBe(key);
      expect(plan.rateLimitPerMinute).toBeGreaterThan(0);
      expect(plan.scopes.length).toBeGreaterThan(0);
      // scopes only ever grow or stay level as you go up a self-service tier.
    }
  });

  it("free is self-service and costs nothing", () => {
    expect(API_PLANS.free.selfService).toBe(true);
    expect(API_PLANS.free.priceCentsPerMonth).toBe(0);
  });

  it("scale is not self-service (sales-negotiated)", () => {
    expect(API_PLANS.scale.selfService).toBe(false);
    expect(API_PLANS.scale.priceCentsPerMonth).toBeNull();
  });

  it("higher tiers never grant fewer scopes than Free", () => {
    for (const scope of API_PLANS.free.scopes) {
      expect(API_PLANS.starter.scopes).toContain(scope);
      expect(API_PLANS.pro.scopes).toContain(scope);
    }
  });
});

describe("isPlanKey / getPlan", () => {
  it("recognizes valid plan keys", () => {
    expect(isPlanKey("starter")).toBe(true);
    expect(isPlanKey("nonsense")).toBe(false);
  });

  it("falls back to free for an unknown or missing plan key", () => {
    expect(getPlan(null).key).toBe("free");
    expect(getPlan(undefined).key).toBe("free");
    expect(getPlan("not-a-real-plan").key).toBe("free");
  });

  it("returns the matching plan for a valid key", () => {
    expect(getPlan("pro").key).toBe("pro");
  });
});
