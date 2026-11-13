import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bronRegel, kortAdres } from "@/lib/shop/link-product";

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("de bron bij een conceptproduct in Beheer", () => {
  it("toont alleen host en pad, nooit een querystring, fragment of token", () => {
    expect(kortAdres("https://leverancier.example/product/fleece-vest/?utm=x&token=geheim#foto")).toBe("leverancier.example/product/fleece-vest");
    expect(kortAdres("https://user:wachtwoord@cdn.example/a/b.jpg?sig=abc")).toBe("cdn.example/a/b.jpg");
    expect(kortAdres("javascript:alert(1)")).toBeNull();
    expect(kortAdres("geen adres")).toBeNull();
    expect(kortAdres(null)).toBeNull();
    expect(kortAdres(`https://x.example/${"a".repeat(200)}`)?.length).toBeLessThanOrEqual(90);
  });

  it("de regel zegt Bron en dat je moet controleren of de foto mag, en staat er alleen met een bron", () => {
    const r = bronRegel({ pagina: "https://leverancier.example/p/vest?token=1", foto: "https://cdn.example/v.jpg?x=2" });
    expect(r).toBe("Bron: pagina leverancier.example/p/vest, foto cdn.example/v.jpg. Controleer of je de foto mag gebruiken.");
    expect(r).not.toMatch(/token|\?/);
    expect(bronRegel({ pagina: null, foto: "https://cdn.example/v.jpg" })).toBe("Bron: foto cdn.example/v.jpg. Controleer of je de foto mag gebruiken.");
    expect(bronRegel(null)).toBeNull();
    expect(bronRegel({ pagina: null, foto: null })).toBeNull();
  });

  it("de route is strikt voor platformbeheer en geeft de korte adressen; het scherm toont de regel klein", () => {
    const route = bron("app/api/admin/shop-ai/bronnen/route.ts");
    expect(route).toContain('["PLATFORM_ADMIN"]');
    expect(bron("lib/shop/link-product-server.ts")).toContain("kortAdres(r.value?.pagina)");
    const scherm = bron("components/admin/ShopAdmin.tsx");
    expect(scherm).toContain("/api/admin/shop-ai/bronnen");
    expect(scherm).toContain("bronRegel(bronnen[product.id])");
    expect(scherm).toContain("text-[11px]");
  });
});

describe("de prompt van maakConcept belooft niets", () => {
  it("verbiedt levertijd, voorraad, merk-, CE-, keurmerk- en kwaliteitsbeloftes", () => {
    const ai = bron("lib/shop/winkel-ai.ts");
    expect(ai).toContain("GEEN levertijd, voorraad, merk-, CE-, keurmerk- of kwaliteitsbelofte");
    // de oude regel over verzonnen certificeringen en maten blijft staan
    expect(ai).toContain("verzin GEEN certificeringen");
  });
});