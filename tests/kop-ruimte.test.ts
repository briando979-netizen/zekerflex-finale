import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KOP_RUIMTE_GRENS, kopHeeftRuimteNodig } from "@/lib/marketing/kop-ruimte";

// De kopbalk in lange talen (28 nov 2026, lib/marketing/kop-ruimte.ts): gemeten met de echte vertalingen viel de grens tussen
// 1,12 (past) en 1,20 (te breed op 1280 px).
const ZINNEN = ["Hoe het werkt", "Branches", "Over ons", "Kennis", "Werkers", "Bedrijven", "Inloggen"];
const KNOPPEN = ["Maak gratis je profiel", "Plaats een klus"];

describe("kopHeeftRuimteNodig", () => {
  it("Nederlands (geen vertaling) past altijd", () => {
    expect(kopHeeftRuimteNodig((z) => z, ZINNEN, KNOPPEN)).toBe(false);
  });

  it("een taal net onder de grens past, een taal erboven krijgt de compacte balk", () => {
    const rek = (f: number) => (z: string) => "x".repeat(Math.round(z.length * f));
    expect(kopHeeftRuimteNodig(rek(1.1), ZINNEN, KNOPPEN)).toBe(false);
    expect(kopHeeftRuimteNodig(rek(1.25), ZINNEN, KNOPPEN)).toBe(true);
    expect(KOP_RUIMTE_GRENS).toBeGreaterThan(1.12);
    expect(KOP_RUIMTE_GRENS).toBeLessThan(1.2);
  });

  it("van de knoppen telt alleen de langste, want er staat er maar één in de balk", () => {
    const lang = (z: string) => (z === "Plaats een klus" ? "y".repeat(200) : z);
    expect(kopHeeftRuimteNodig(lang, ZINNEN, KNOPPEN)).toBe(true);
    expect(kopHeeftRuimteNodig(lang, ZINNEN, [])).toBe(false);
  });

  it("de kop, het mobiele menu en de naam schakelen allemaal op dezelfde breedte (1600 px) als de taal meer ruimte nodig heeft", () => {
    const kop = readFileSync(join(process.cwd(), "components/marketing/SiteHeader.tsx"), "utf8");
    const menu = readFileSync(join(process.cwd(), "components/marketing/MobileMenu.tsx"), "utf8");
    expect(kop).toContain("kopHeeftRuimteNodig(");
    for (const regel of ["min-[1600px]:flex", "min-[1600px]:hidden", "max-[479px]:sr-only"]) expect(kop).toContain(regel);
    expect(menu).toContain("min-[1600px]:hidden");
  });
});
