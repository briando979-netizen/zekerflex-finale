import { describe, expect, it } from "vitest";
import { PARTNER_PLANS, partnerPlan, planIncludes } from "@/lib/partner-plans";

describe("partner-plans catalogus", () => {
  it("heeft drie pakketten met unieke id's en een CTA", () => {
    const ids = PARTNER_PLANS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["plugin", "platform", "soeverein"]));
    for (const p of PARTNER_PLANS) {
      expect(p.features.length).toBeGreaterThan(0);
      expect(p.ctaLabel).toBeTruthy();
      expect(p.priceLabel).toBeTruthy();
    }
  });

  it("precies één featured pakket", () => {
    expect(PARTNER_PLANS.filter((p) => p.featured)).toHaveLength(1);
  });

  it("partnerPlan vindt op id en geeft undefined voor onbekend", () => {
    expect(partnerPlan("platform")?.name).toBe("Platform (white-label)");
    expect(partnerPlan("bestaat-niet")).toBeUndefined();
  });

  it("planIncludes respecteert entitlements en de * -wildcard", () => {
    expect(planIncludes("plugin", "api")).toBe(true);
    expect(planIncludes("plugin", "webshop")).toBe(false);
    expect(planIncludes("platform", "recruiter")).toBe(true);
    expect(planIncludes("soeverein", "wat-dan-ook")).toBe(true); // "*"
    expect(planIncludes("onbekend", "api")).toBe(false);
  });
});
