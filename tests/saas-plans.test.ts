import { describe, expect, it } from "vitest";
import { SAAS_PLANS, SAAS_PLAN_KEYS, isSaasPlanKey, saasPlan, saasPlanIncludes } from "@/lib/billing/saas-plans";

describe("SaaS-abonnementen catalogus", () => {
  it("heeft de vier tiers en elke self-service tier heeft een prijs", () => {
    expect([...SAAS_PLAN_KEYS]).toEqual(["starter", "pro", "business", "enterprise"]);
    for (const key of SAAS_PLAN_KEYS) {
      const p = SAAS_PLANS[key];
      expect(p.features.length).toBeGreaterThan(0);
      if (p.selfService) expect(p.priceCentsPerMonth).not.toBeNull();
    }
  });

  it("alleen enterprise is op aanvraag (geen self-service)", () => {
    expect(SAAS_PLANS.enterprise.selfService).toBe(false);
    expect(SAAS_PLANS.enterprise.priceCentsPerMonth).toBeNull();
    expect(SAAS_PLANS.pro.selfService).toBe(true);
    expect(SAAS_PLANS.pro.priceCentsPerMonth).toBe(149_00);
  });

  it("saasPlan + isSaasPlanKey herkennen alleen geldige keys", () => {
    expect(saasPlan("pro")?.label).toBe("Pro");
    expect(saasPlan("bestaat-niet")).toBeNull();
    expect(isSaasPlanKey("business")).toBe(true);
    expect(isSaasPlanKey("gold")).toBe(false);
  });

  it("entitlements lopen op per tier; enterprise = alles (*)", () => {
    expect(saasPlanIncludes("starter", "recruiter")).toBe(false);
    expect(saasPlanIncludes("pro", "recruiter")).toBe(true);
    expect(saasPlanIncludes("pro", "bank")).toBe(false);
    expect(saasPlanIncludes("business", "bank")).toBe(true);
    expect(saasPlanIncludes("enterprise", "wat-dan-ook")).toBe(true);
    expect(saasPlanIncludes("onbekend", "recruiter")).toBe(false);
  });
});
