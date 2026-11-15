import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { kleurFotoKandidaten, kleurSlug, kleurStip } from "@/lib/shop/kleurfoto-naam";
import { kleurFotos } from "@/lib/shop/kleurfoto";

// Een foto per kleur in de webshop (15 nov 2026): klik je op een kleur, dan verschijnt de foto in die kleur. Bestanden
// in public/shop als <basis>-<kleur>.jpg; de productpagina krijgt per kleur de foto die er echt is.

const SHOP = path.join(process.cwd(), "public", "shop");

describe("de naam van een kleurfoto", () => {
  it("kleur als webadres, naast de hoofdfoto of onder het webadres van het product", () => {
    expect(kleurSlug("Licht blauw")).toBe("licht-blauw");
    expect(kleurSlug("Écru")).toBe("ecru");
    expect(kleurFotoKandidaten("chino-broek-zakelijk", "/shop/chino-broek-1.jpg", "Marineblauw")).toEqual(["/shop/chino-broek-marineblauw.jpg", "/shop/chino-broek-zakelijk-marineblauw.jpg"]);
    expect(kleurFotoKandidaten("thermo-bodywarmer-unisex", null, "Zwart")).toEqual(["/shop/thermo-bodywarmer-unisex-zwart.jpg"]);
    expect(kleurFotoKandidaten("x", "https://elders.nl/foto.jpg", "Rood")).toEqual(["/shop/x-rood.jpg"]);
  });

  it("een stipje bij bekende kleuren; onbekende (of wat elk object erft) geen", () => {
    expect(kleurStip("Lichtblauw")).toBe("#CFE2F0");
    expect(kleurStip("Marine blauw")).toBe("#26345A");
    expect(kleurStip("Zeegroen met glitters")).toBeNull();
    expect(kleurStip("constructor")).toBeNull();
  });
});

describe("de foto's die er zijn", () => {
  it("elk product met meer kleuren heeft voor elke kleur een foto (de hoofdfoto of een kleurfoto)", () => {
    const producten = [
      { slug: "business-overhemd-heren", imageUrl: "/shop/business-overhemd-1.jpg", kleuren: ["Wit", "Lichtblauw"], hoofd: "Wit" },
      { slug: "business-blouse-dames", imageUrl: "/shop/business-blouse-1.jpg", kleuren: ["Lichtblauw", "Wit"], hoofd: "Lichtblauw" },
      { slug: "chino-broek-zakelijk", imageUrl: "/shop/chino-broek-1.jpg", kleuren: ["Khaki", "Marineblauw"], hoofd: "Khaki" },
      { slug: "fleece-vest-met-rits", imageUrl: "/shop/fleece-vest-1.jpg", kleuren: ["Grijs", "Zwart"], hoofd: "Grijs" },
      { slug: "zekerflex-kids-tshirt", imageUrl: "/shop/kids-tshirt-1.jpg", kleuren: ["Mintgroen", "Zwart"], hoofd: "Mintgroen" },
      { slug: "thermo-bodywarmer-unisex", imageUrl: null, kleuren: ["Marineblauw", "Zwart"], hoofd: null },
    ];
    for (const p of producten) {
      const fotos = kleurFotos({ slug: p.slug, imageUrl: p.imageUrl, variants: p.kleuren.map((color) => ({ color })) });
      for (const k of p.kleuren) {
        if (k === p.hoofd) continue;
        expect(fotos[k], `${p.slug} ${k}`).toBeTruthy();
        expect(existsSync(path.join(SHOP, path.basename(fotos[k]!))), `${p.slug} ${k}`).toBe(true);
      }
    }
  });

  it("het script en de bronvermelding horen erbij", () => {
    expect(existsSync(path.join(process.cwd(), "scripts", "shop-kleurfotos.mjs"))).toBe(true);
    expect(readFileSync(path.join(SHOP, "CREDITS.md"), "utf8")).toContain("scripts/shop-kleurfotos.mjs");
  });
});

describe("op de productpagina", () => {
  it("de gekozen kleur zet zijn foto vooraan en toont hem meteen; de knop heeft een stipje", () => {
    const pdp = readFileSync(path.join(process.cwd(), "components/marketing/ProductDetail.tsx"), "utf8").split("\r\n").join("\n");
    expect(pdp).toContain("const gallery = [...new Set([kleurFoto ?? product.imageUrl, product.modelPhotoUrl].filter(Boolean) as string[])];");
    expect(pdp).toContain("setActive(0);\n                      setShow3d(false);");
    expect(pdp).toContain("kleurStip(c)");
    expect(readFileSync(path.join(process.cwd(), "app/shop/[slug]/page.tsx"), "utf8")).toContain("kleurFotos: kleurFotos(product)");
  });
});
