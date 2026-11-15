import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { afstand, bedoeldeJe, zoekScore } from "@/lib/shop/zoeksuggesties";

// De webshop zoals bol.com, stap 4 (15 nov 2026): slimmer zoeken ("Bedoelde je …?", tips als er niets is) en een fotoviewer
// op de productpagina (groot, inzoomen, bladeren met pijlen en vegen).

const lees = (f: string) => readFileSync(join(process.cwd(), f), "utf8").split("\r\n").join("\n");

const producten = [
  { name: "Everyday Hoodie", category: "Kleding", description: "Zachte sweatstof" },
  { name: "Veiligheidsschoen S3", category: "Werk & PBM", description: "Stalen neus" },
  { name: "Grijze werkbroek", category: "Kleding", description: "Stevig en ruim" },
  { name: "Café-schort", category: "Kleding", description: "Voor de horeca" },
];

describe("Bedoelde je …?", () => {
  it("rekent de bewerkingsafstand, met een plafond", () => {
    expect(afstand("hoddie", "hoodie")).toBe(1);
    expect(afstand("broek", "broek")).toBe(0);
    expect(afstand("kat", "olifant", 2)).toBe(3);
  });

  it("verbetert een tikfout met woorden uit de catalogus, alleen als dat iets vindt", () => {
    expect(bedoeldeJe(producten, "hoddie")).toBe("hoodie");
    expect(bedoeldeJe(producten, "veilgheidsschoen")).toBe("veiligheidsschoen");
    expect(bedoeldeJe(producten, "grijze werkbrook")).toBe("grijze werkbroek");
    expect(bedoeldeJe(producten, "kafe")).toBe("cafe");
  });

  it("geeft niets als de vraag al iets vindt, te kort is, of niet te verbeteren", () => {
    expect(bedoeldeJe(producten, "hoodie")).toBeNull();
    expect(bedoeldeJe(producten, "ho")).toBeNull();
    expect(bedoeldeJe(producten, "xyzqqq")).toBeNull();
    // korte woorden mogen maar één letter verschillen
    expect(bedoeldeJe(producten, "bxxk")).toBeNull();
  });

  it("zoekt woord voor woord en zonder accenten", () => {
    expect(zoekScore(producten[2]!, "werkbroek grijze")).toBeGreaterThan(0);
    expect(zoekScore(producten[3]!, "cafe schort")).toBeGreaterThan(0);
  });
});

describe("de shop zelf", () => {
  it("de etalage zoekt met dezelfde regels als de suggesties, beste eerst, en helpt als er niets is", () => {
    const etalage = lees("components/marketing/ShopStorefront.tsx");
    expect(etalage).toContain("zoekScore(p, q) > 0");
    expect(etalage).toContain("[...lijst].sort((a, b) => zoekScore(b, q) - zoekScore(a, q))");
    expect(etalage).toContain("bedoeldeJe(products, query)");
    expect(etalage).toContain("fmt(t.shop.bedoeldeJe, { q: voorstel })");
    expect(etalage).toContain("t.shop.misschienDit");
  });

  it("de zoekbalk biedt bij een tikfout meteen de verbeterde vraag", () => {
    const chrome = lees("components/marketing/ShopChrome.tsx");
    expect(chrome).toContain('{ soort: "bedoeld"; q: string }');
    expect(chrome).toContain("const voorstel = bedoeldeJe(catalog, q);");
  });

  it("de grote foto opent de fotoviewer, die netjes sluit en de focus teruggeeft", () => {
    const pdp = lees("components/marketing/ProductDetail.tsx");
    expect(pdp).toContain("onClick={() => setViewer(true)} aria-label={t.shop.fotoVergroot}");
    expect(pdp).toContain("requestAnimationFrame(() => fotoKnopRef.current?.focus());");
    const viewer = lees("components/marketing/FotoViewer.tsx");
    expect(viewer).toContain('role="dialog" aria-modal="true"');
    expect(viewer).toContain('if (e.key === "Escape") setSluit(true);');
    expect(viewer).toContain("document.body.style.overflow = vorigeOverflow;");
    expect(viewer).not.toContain("eslint-disable");
    // geen lookbehind (Safari vóór 16.4) en geen waarde uit een effect behalve opruimen
    expect(viewer).not.toMatch(/\(\?<[=!]/);
    expect(viewer).not.toMatch(/useEffect\(\(\) => [a-z]/);
  });

  it("alle nieuwe teksten staan in het Nederlands én het Engels", () => {
    const nl = lees("lib/i18n/dictionaries.ts");
    const en = lees("lib/i18n/dictionary-en.ts");
    for (const k of ["bedoeldeJe", "nietsGevonden", "zoekTips", "misschienDit", "fotoVergroot", "fotoInzoomen", "fotoUitzoomen", "fotoVorige", "fotoVolgende"]) {
      expect(nl, k).toMatch(new RegExp(`\\n\\s+${k}: "`));
      expect(en, k).toMatch(new RegExp(`\\n\\s+${k}: "`));
    }
  });
});
