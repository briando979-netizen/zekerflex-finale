import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SHOP_CATEGORIEEN } from "@/lib/shop/categorieen";
import { SUBGROEPEN, subgroepPad, subgroepenVoor, typischEerst } from "@/lib/shop/subgroepen";
import { shopBanners } from "@/lib/shop/banners";
import type { EtalageProduct } from "@/lib/shop/etalage";
import { zoekScore } from "@/lib/shop/zoeksuggesties";

// Het grote categoriemenu, de banners en de vergelijkbalk van de shop (18 nov 2026). Alles uit de echte catalogus: een
// subgroep zonder treffers staat er niet, een banner zonder genoeg foto's ook niet, en er is geen banner met een korting.

const lees = (f: string) => readFileSync(join(process.cwd(), f), "utf8").split("\r\n").join("\n");

const p = (name: string, category: string, extra: Partial<EtalageProduct> = {}): EtalageProduct & { description?: string } => ({
  id: name,
  name,
  category,
  price: 20,
  opVoorraad: true,
  imageUrl: `/foto/${encodeURIComponent(name)}.jpg`,
  ...extra,
});

const catalogus = [
  p("LED zaklamp zoom usb oplaadbaar", "Sport & buiten"),
  p("USB Rechargeable Work Light Magnetic LED Flashlight", "Sport & buiten"),
  p("LED Telescoop Hoofdlamp Rechargebaar", "Sport & buiten"),
  p("Yogamat antislip", "Sport & buiten"),
  p("Kids Electric Car 12V", "Speelgoed"),
  p("Kids Bouncy Castle", "Speelgoed"),
  p("168 Color Dual Tip Art Markers", "Speelgoed"),
  p("Houten trein", "Speelgoed", { imageUrl: null }),
  p("Vogelhuisje", "Huisdieren"),
];

describe("subgroepen in het categoriemenu", () => {
  it("elke categorie heeft een lijst, met Nederlandse en Engelse naam en minstens één zoekwoord", () => {
    expect(Object.keys(SUBGROEPEN).sort()).toEqual([...SHOP_CATEGORIEEN].sort());
    for (const c of SHOP_CATEGORIEEN) {
      expect(SUBGROEPEN[c].length, c).toBeGreaterThan(0);
      for (const s of SUBGROEPEN[c]) {
        expect(s.nl && s.en, `${c}/${s.nl}`).toBeTruthy();
        expect(s.zoek.length, `${c}/${s.nl}`).toBeGreaterThan(0);
        // de shop zoekt pas vanaf twee tekens echt (zoekScore)
        for (const z of s.zoek) expect(z.length, z).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("toont alleen subgroepen met treffers, met het aantal dat de link daarna ook laat zien", () => {
    const subs = subgroepenVoor(catalogus, "Sport & buiten");
    expect(subs.map((s) => s.nl)).toEqual(["Zaklampen", "Hoofdlampen", "Werklampen"]);
    for (const s of subs) {
      expect(s.aantal).toBe(catalogus.filter((x) => x.category === "Sport & buiten" && zoekScore(x, s.zoek) > 0).length);
      expect(s.href).toBe(subgroepPad("Sport & buiten", s.zoek));
    }
    // het zoekwoord dat het meeste vindt gaat in de link: "zaklamp" (1) of "flashlight" (1) blijft de eerste
    expect(subs[0]?.href).toBe("/shop?cat=Sport%20%26%20buiten&q=zaklamp#collectie");
  });

  it("geen lege keuzes: een categorie zonder producten of zonder treffers geeft niets, en een vreemde sleutel ook niet", () => {
    expect(subgroepenVoor(catalogus, "Kleding")).toEqual([]);
    expect(subgroepenVoor(catalogus, "Huisdieren")).toEqual([]);
    expect(subgroepenVoor(catalogus, "constructor")).toEqual([]);
  });

  it("zet de producten die duidelijk bij de categorie horen vooraan", () => {
    const rij = typischEerst(catalogus, "Sport & buiten").map((x) => x.name);
    expect(rij[rij.length - 1]).toBe("Yogamat antislip");
    expect(rij).toHaveLength(4);
    expect(typischEerst(catalogus, "constructor")).toEqual([]);
  });
});

describe("banners", () => {
  const sint = new Date("2026-11-18T12:00:00+01:00");
  const januari = new Date("2027-01-15T12:00:00+01:00");

  it("in de weken van Sinterklaas staat die banner vooraan, met foto's van echte producten en een link naar een categorie die bestaat", () => {
    const b = shopBanners(catalogus, sint);
    expect(b[0]?.sleutel).toBe("sint");
    expect(b[0]?.href).toBe("/shop?cat=Speelgoed#collectie");
    expect(b[0]?.aantal).toBe(4);
    expect(b[0]?.fotos).toHaveLength(3);
    // de categorie van de seizoensbanner krijgt niet ook nog een eigen banner
    expect(b.map((x) => x.sleutel)).toEqual(["sint", "cat-Sport & buiten"]);
  });

  it("buiten het seizoen alleen categorieën, en nooit een banner met minder dan drie foto's", () => {
    const b = shopBanners(catalogus, januari);
    expect(b.map((x) => x.sleutel)).toEqual(["cat-Speelgoed", "cat-Sport & buiten"]);
    expect(shopBanners(catalogus.slice(0, 2), januari)).toEqual([]);
    expect(shopBanners([], sint)).toEqual([]);
  });

  it("elke foto staat maar één keer op de pagina", () => {
    const fotos = shopBanners(catalogus, sint).flatMap((x) => x.fotos);
    expect(new Set(fotos).size).toBe(fotos.length);
  });

  it("geen verzonnen korting: zonder echte aanbiedingen (lib/shop/aanbieding.ts) geen deal, percentage of aftelklok in de banners", () => {
    const blok = lees("components/marketing/ShopEtalage.tsx");
    expect(blok).not.toMatch(/line-through|adviesprijs|dagdeal|korting|black friday/i);
    const teksten = [...shopBanners(catalogus, sint), ...shopBanners(catalogus, new Date("2026-12-10T12:00:00+01:00"))].map((b) => `${b.kop.nl} ${b.kop.en} ${b.accent.nl} ${b.accent.en}`).join(" ");
    expect(teksten).not.toMatch(/korting|deal|sale|%|black friday/i);
    // met echte aanbiedingen (minstens drie) komt de banner er wel, zonder percentage of aftelklok
    const metDeals = shopBanners(catalogus.map((x, i) => ({ ...x, deal: i < 3 })), new Date("2026-11-27T12:00:00+01:00"));
    expect(metDeals[0]?.sleutel).toBe("black-friday");
    expect(`${metDeals[0]?.accent.nl} ${metDeals[0]?.accent.en}`).not.toMatch(/%|\d/);
    // de rij veegt op de telefoon zonder dat de pagina breder wordt
    expect(blok).toMatch(/<ul className="relative -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto/);
  });
});

describe("in de shop-omlijsting", () => {
  it("de balk en het menu krijgen de telling per categorie van de server", () => {
    const layout = lees("app/shop/layout.tsx");
    expect(layout).toContain('prisma.shopProduct.groupBy({ by: ["category"], where: { active: true }, _count: { _all: true } }).catch(() => [])');
    expect(layout).toContain("catAantallen={catAantallen}");
    const chrome = lees("components/marketing/ShopChrome.tsx");
    expect(chrome).toContain("const NAV = navVoor(modus, t, catAantallen);");
    expect(chrome).toContain("aantallen={catAantallen}");
    // een vaste tabel bevragen met Object.hasOwn, niet met `in`
    expect(chrome).toContain("Object.hasOwn(aantallen, c)");
  });

  it("het menu is een dialoog met een paneel voor breed en een lade voor de telefoon, en gebruikt geen beelden van buiten", () => {
    const menu = lees("components/marketing/ShopCategorieMenu.tsx");
    expect(menu).toContain('role="dialog" aria-modal="true" aria-label={t.shop.allCategories}');
    expect(menu).toContain('className="absolute inset-x-0 hidden lg:block"');
    expect(menu).toContain("lg:hidden");
    expect(menu).not.toMatch(/https?:\/\//);
    expect(menu).toContain("subgroepenVoor(catalog, cat)");
  });

  it("de vergelijkbalk heeft een knop naar de vergelijking vanaf twee, meldt het aantal en laat ruimte voor de chatknop", () => {
    const balk = lees("components/marketing/ShopVergelijkBalk.tsx");
    expect(balk).toContain('role="status" aria-live="polite"');
    expect(balk).toContain("{n >= 2 ? (");
    expect(balk).toContain("t.shop.vergelijkKiesNog");
    expect(balk).toContain("pr-[84px]");
    expect(balk).toContain("env(safe-area-inset-bottom)");
  });

  it("alle nieuwe teksten staan in het Nederlands én het Engels", () => {
    const nl = lees("lib/i18n/dictionaries.ts");
    const en = lees("lib/i18n/dictionary-en.ts");
    for (const k of ["menuLaden", "menuTerug", "menuPopulair", "vergelijkKiesNog", "vergelijkGekozen"]) {
      expect(nl, k).toMatch(new RegExp(`\\n\\s+${k}: "`));
      expect(en, k).toMatch(new RegExp(`\\n\\s+${k}: "`));
    }
  });
});
