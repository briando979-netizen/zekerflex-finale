import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { productZicht } from "@/lib/shop/niet-leverbaar";

// Oude links naar een eigen product dat uit staat gaven een kale 404 (19 nov 2026: /shop/pantalons,
// /shop/zekerflex-kids-tshirt). Nu een pagina "Niet meer leverbaar"; een verkopersproduct dat uit staat
// blijft verborgen.
describe("productZicht", () => {
  it("toont een actief product", () => {
    expect(productZicht({ active: true, sellerTenantId: null })).toBe("toon");
    expect(productZicht({ active: true, sellerTenantId: "t1" })).toBe("toon");
  });
  it("een eigen product dat uit staat: niet meer leverbaar", () => {
    expect(productZicht({ active: false, sellerTenantId: null })).toBe("niet-leverbaar");
  });
  it("een verkopersproduct dat uit staat (in beoordeling, afgewezen) blijft verborgen", () => {
    expect(productZicht({ active: false, sellerTenantId: "t1" })).toBe("verborgen");
  });
  it("geen product: verborgen", () => {
    expect(productZicht(null)).toBe("verborgen");
  });
});

describe("/shop/[slug]", () => {
  const bron = readFileSync("app/shop/[slug]/page.tsx", "utf8");
  it("gebruikt productZicht voor de pagina én de metadata", () => {
    expect(bron.match(/productZicht\(/g)?.length).toBe(2);
    expect(bron).not.toMatch(/!product\.active\)\s*notFound/);
  });
  it("zet de pagina van een niet-leverbaar product niet in Google", () => {
    const regel = bron.split("\n").find((r) => r.includes('zicht === "niet-leverbaar") return'));
    expect(regel).toContain("robots: { index: false");
  });
});
