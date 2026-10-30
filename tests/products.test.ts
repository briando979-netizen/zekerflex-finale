import { describe, expect, it } from "vitest";
import { SPINOFF_PRODUCTS, FLAGSHIP, ALL_PRODUCTS, PRODUCT_SLUGS, spinoffProduct, productBySlug } from "@/lib/products";

describe("Product-catalogus (ontbundeld)", () => {
  it("heeft drie spin-offs + het vlaggenschip, met unieke slugs", () => {
    expect(SPINOFF_PRODUCTS.map((p) => p.slug)).toEqual(["recruitflex-ai", "sovereignops", "flexcompliance-api"]);
    expect(FLAGSHIP.flagship).toBe(true);
    expect(ALL_PRODUCTS).toHaveLength(SPINOFF_PRODUCTS.length + 1);
    const slugs = ALL_PRODUCTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("elk product heeft de kernvelden gevuld", () => {
    for (const p of ALL_PRODUCTS) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.tagline.length).toBeGreaterThan(0);
      expect(p.priceLabel.length).toBeGreaterThan(0);
      expect(p.features.length).toBeGreaterThan(0);
      expect(p.why.length).toBeGreaterThan(0);
      expect(["laag", "gemiddeld", "hoog"]).toContain(p.salesComplexity);
    }
  });

  it("spinoffProduct herkent alleen de spin-off-slugs", () => {
    expect(spinoffProduct("recruitflex-ai")?.name).toBe("RecruitFlex AI");
    expect(spinoffProduct("zekerflex-platform")).toBeUndefined(); // vlaggenschip is geen spin-off
    expect(spinoffProduct("bestaat-niet")).toBeUndefined();
    expect([...PRODUCT_SLUGS]).toEqual(["recruitflex-ai", "sovereignops", "flexcompliance-api"]);
  });

  it("productBySlug herkent spin-offs én het vlaggenschip", () => {
    expect(productBySlug("flexcompliance-api")?.name).toBe("FlexCompliance API");
    expect(productBySlug("zekerflex-platform")?.flagship).toBe(true);
    expect(productBySlug("onbekend")).toBeUndefined();
  });

  it("alleen het vlaggenschip is 'hoog' complex; RecruitFlex AI is 'laag' (Trojan Horse)", () => {
    expect(FLAGSHIP.salesComplexity).toBe("hoog");
    expect(spinoffProduct("recruitflex-ai")?.salesComplexity).toBe("laag");
  });
});
