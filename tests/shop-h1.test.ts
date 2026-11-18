import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 18 nov 2026: na het weghalen van de kop had /shop geen h1 meer (alles begon bij h2). De winkelpagina houdt één h1:
// onzichtbaar (sr-only, met een gepositioneerde ouder) op de startpagina van de shop, en de assortimentstitel als h1
// zodra iemand zoekt of filtert (ShopStorefront met pageTitle).

const lees = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("/shop heeft één h1", () => {
  it("de startpagina van de shop zet een onzichtbare h1 met een relative ouder, alleen buiten zoeken/filteren", () => {
    const bron = lees("app/shop/page.tsx");
    expect(bron).toMatch(/\{!browsing && \(\s*<div className="relative">\s*<h1 className="sr-only">\{korteTitel\}<\/h1>/);
  });

  it("bij zoeken of filteren is de assortimentstitel de h1", () => {
    const bron = lees("components/marketing/ShopStorefront.tsx");
    expect(bron).toContain('const Heading = pageTitle ? "h1" : "h2";');
    expect(lees("app/shop/page.tsx")).toContain("pageTitle={browsing}");
  });
});
