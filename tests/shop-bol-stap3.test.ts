import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_VERGELIJK, idsUitAdres, vergelijkPad, vergelijkRij, wisselVergelijk } from "@/lib/shop/vergelijk";
import { categoriePad, menuGroep, voorUitAdres } from "@/lib/shop/categoriemenu";
import { APP_PAGES } from "@/lib/dev/app-pages.generated";

// De webshop zoals bol.com, stap 3 (15 nov 2026): producten vergelijken (hooguit vier, naast elkaar, met "Alleen verschillen
// tonen") en het menu "Alle categorieën" met aantallen en Heren/Dames/Kinderen uit de echte catalogus.

const lees = (f: string) => readFileSync(join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("vergelijken", () => {
  it("zet erbij en haalt weg, en houdt op bij vier", () => {
    expect(MAX_VERGELIJK).toBe(4);
    expect(wisselVergelijk([], "a")).toEqual({ ids: ["a"], vol: false });
    expect(wisselVergelijk(["a", "b"], "a")).toEqual({ ids: ["b"], vol: false });
    expect(wisselVergelijk(["a", "b", "c", "d"], "e")).toEqual({ ids: ["a", "b", "c", "d"], vol: true });
    // weghalen kan ook als hij vol is
    expect(wisselVergelijk(["a", "b", "c", "d"], "c")).toEqual({ ids: ["a", "b", "d"], vol: false });
  });

  it("leest het adres netjes: geen rommel, geen dubbele, hooguit vier", () => {
    expect(idsUitAdres("cm1abcdef,cm2abcdef,cm1abcdef")).toEqual(["cm1abcdef", "cm2abcdef"]);
    expect(idsUitAdres("cm1abcdef,<script>,kort,cm3abcdef")).toEqual(["cm1abcdef", "cm3abcdef"]);
    expect(idsUitAdres("aaaaaa1,aaaaaa2,aaaaaa3,aaaaaa4,aaaaaa5")).toHaveLength(4);
    expect(idsUitAdres(["cm1abcdef"])).toEqual([]);
    expect(idsUitAdres(undefined)).toEqual([]);
  });

  it("maakt een adres dat je kunt delen", () => {
    expect(vergelijkPad(["a1", "b2"])).toBe("/shop/vergelijk?ids=a1,b2");
    expect(vergelijkPad([])).toBe("/shop/vergelijk");
  });

  it("weet per rij of de producten verschillen", () => {
    expect(vergelijkRij("maten", "Maten", ["S, M", "S, M"]).verschilt).toBe(false);
    expect(vergelijkRij("prijs", "Prijs", ["€ 10,00", "€ 12,00"]).verschilt).toBe(true);
  });

  it("de vergelijkpagina haalt alleen actieve producten op de server op, en staat niet in Google", () => {
    const pagina = lees("app/shop/vergelijk/page.tsx");
    expect(pagina).toContain("where: { id: { in: gevraagd }, active: true }");
    expect(pagina).toContain("robots: { index: false }");
    expect(APP_PAGES.some((p) => p.route === "/shop/vergelijk" && !p.dynamic)).toBe(true);
  });

  it("op de pagina is het adres leidend: weghalen zet niets terug", () => {
    const scherm = lees("components/marketing/ShopVergelijk.tsx");
    expect(scherm).toContain("const opgeslagen = leesVergelijk();");
    expect(scherm).toContain("}, [uitAdres, zet, router]);");
    expect(scherm).toContain("const nieuw = gevraagd.filter((x) => x !== id);");
    // de tabel kan vegen op de telefoon zonder dat de pagina breder wordt (sr-only in een vegende rij)
    expect(scherm).toContain('className="relative mt-4 overflow-x-auto rounded-xl border border-hair"');
  });

  it("een kaartje heeft het vinkje Vergelijk, boven de kaartlink, en meldt het als er al vier zijn", () => {
    const kaart = lees("components/marketing/ShopProductCard.tsx");
    expect(kaart).toContain("onChange={() => setVergelijkVol(!vergelijk.wissel(p.id))}");
    expect(kaart).toContain('<div className="relative z-10 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">');
    expect(kaart).toMatch(/role="alert"[^>]*>\n\s+\{t\.shop\.vergelijkVol\}/);
  });
});

describe("het menu Alle categorieën", () => {
  const catalogus = [
    { category: "Kleding", gender: "heren" },
    { category: "Kleding", gender: "heren" },
    { category: "Kleding", gender: "vrouwen" },
    { category: "Kleding", gender: "unisex" },
    { category: "Werk & PBM", gender: null },
  ];

  it("telt per categorie en biedt alleen keuzes die echt producten hebben", () => {
    expect(menuGroep(catalogus, "Kleding")).toEqual({
      aantal: 4,
      voor: [
        { waarde: "heren", aantal: 2 },
        { waarde: "vrouwen", aantal: 1 },
      ],
    });
    expect(menuGroep(catalogus, "Werk & PBM")).toEqual({ aantal: 1, voor: [] });
    expect(menuGroep(catalogus, "Cadeaus")).toEqual({ aantal: 0, voor: [] });
  });

  it("leest ?voor= streng en maakt nette adressen", () => {
    expect(voorUitAdres("heren")).toBe("heren");
    expect(voorUitAdres("constructor")).toBeNull();
    expect(voorUitAdres(["heren"])).toBeNull();
    expect(categoriePad("Werk & PBM")).toBe("/shop?cat=Werk%20%26%20PBM#collectie");
    expect(categoriePad("Kleding", "vrouwen")).toBe("/shop?cat=Kleding&voor=vrouwen#collectie");
  });

  it("het menu haalt de catalogus op als het opengaat, en de etalage volgt ?voor=", () => {
    const chrome = lees("components/marketing/ShopChrome.tsx");
    expect(chrome).toContain("const needCatalog = count > 0 || drawer || zoekt || menu;");
    expect(chrome).toContain("menuGroep(catalog, n.cat)");
    expect(chrome).toContain("fmt(t.shop.vergelijken, { n: vergelijk.count })");
    const etalage = lees("components/marketing/ShopStorefront.tsx");
    expect(etalage).toContain("useState<Gender>(genderUitVoor(initialVoor))");
    expect(etalage).toMatch(/setGender\(genderUitVoor\(initialVoor\)\);\n\s+\}, \[initialVoor\]\);/);
    expect(lees("app/shop/page.tsx")).toContain("const initialVoor = voorUitAdres(searchParams.voor);");
  });

  it("alle nieuwe teksten staan in het Nederlands én het Engels", () => {
    const nl = lees("lib/i18n/dictionaries.ts");
    const en = lees("lib/i18n/dictionary-en.ts");
    for (const k of ["vergelijk", "vergelijkNu", "vergelijken", "vergelijkTitel", "vergelijkLeeg", "vergelijkVol", "vergelijkVerschillen", "vergelijkWeg", "vergelijkKiesMaat"]) {
      expect(nl, k).toMatch(new RegExp(`\\n\\s+${k}: "`));
      expect(en, k).toMatch(new RegExp(`\\n\\s+${k}: "`));
    }
  });
});
