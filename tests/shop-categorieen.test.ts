import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORIE_EN, SHOP_CATEGORIEEN, categorieNaam, isShopCategorie } from "@/lib/shop/categorieen";
import { WINKEL_CATEGORIEEN, categorieVan } from "@/lib/shop/winkel-ai-core";
import { CATEGORIEEN as NIEUW } from "@/lib/shop/nieuw-stappen";
import { CATEGORIEEN as SCHERM } from "@/lib/shop/product-scherm";

// Eén lijst shopcategorieën (18 nov 2026): tot dan stond dezelfde lijst van vier op tien plekken en kon
// een nieuwe categorie (elektronica, speelgoed) op de ene plek wel en op de andere niet bestaan.

const ROOT = join(__dirname, "..");
const OUDE_LIJST = /\[\s*"Werk & PBM",\s*"Kleding",\s*"Werkdag",\s*"Cadeaus"\s*\]/;

function bestanden(map: string): string[] {
  const uit: string[] = [];
  for (const naam of readdirSync(map)) {
    const p = join(map, naam);
    if (statSync(p).isDirectory()) uit.push(...bestanden(p));
    else if (/\.(ts|tsx)$/.test(naam)) uit.push(p);
  }
  return uit;
}

describe("shopcategorieën", () => {
  it("elke lijst in de code is dezelfde lijst", () => {
    expect(WINKEL_CATEGORIEEN).toBe(SHOP_CATEGORIEEN);
    expect(NIEUW).toBe(SHOP_CATEGORIEEN);
    expect(SCHERM).toBe(SHOP_CATEGORIEEN);
    expect(SHOP_CATEGORIEEN.length).toBeGreaterThanOrEqual(11);
    expect(new Set(SHOP_CATEGORIEEN).size).toBe(SHOP_CATEGORIEEN.length);
    for (const c of SHOP_CATEGORIEEN) expect(CATEGORIE_EN[c].length, c).toBeGreaterThan(2);
  });

  it("de oude vaste lijst van vier staat nergens meer los in app/, lib/ of components/ (behalve bij de verkopers)", () => {
    const los = ["app", "lib", "components"].flatMap((m) => bestanden(join(ROOT, m))).filter((p) => OUDE_LIJST.test(readFileSync(p, "utf8")));
    // verkopers mogen bewust alleen in de vier oorspronkelijke categorieën verkopen (lib/shop/verkoper-core.ts)
    expect(los.map((p) => p.replace(ROOT, "").replace(/\\/g, "/")).filter((p) => !p.endsWith("/lib/shop/verkoper-core.ts"))).toEqual([]);
  });

  it("naam in de taal van de shop", () => {
    expect(categorieNaam("Elektronica", false)).toBe("Elektronica");
    expect(categorieNaam("Elektronica", true)).toBe("Electronics");
    expect(categorieNaam("Onbekend", true)).toBe("Onbekend");
    expect(isShopCategorie("Speelgoed")).toBe(true);
    expect(isShopCategorie("constructor")).toBe(false);
  });

  it("de Winkel-AI herkent de nieuwe categorieën", () => {
    expect(categorieVan("elektronica")).toBe("Elektronica");
    expect(categorieVan("speelgoed")).toBe("Speelgoed");
    expect(categorieVan("Sieraden & horloges")).toBe("Sieraden & horloges");
    expect(categorieVan("drinkfles")).toBe("Werkdag");
    expect(categorieVan("pbm")).toBe("Werk & PBM");
  });
});
