import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cadeauKeuzes,
  catalogusOverzicht,
  collectieUitAdres,
  inPrijsklasse,
  ontdekTegels,
  prijsUitAdres,
  seizoenVan,
  themaKaarten,
  type EtalageProduct,
} from "@/lib/shop/etalage";

// De voorpagina van de shop zoals bol.com (stap 6, 15 nov 2026): Uitgelicht, thema's, cadeauhulp, Ontdek alles en Snel
// regelen. Alleen uit de echte catalogus; geen verzonnen deals of kortingen.

const lees = (f: string) => readFileSync(join(process.cwd(), f), "utf8").split("\r\n").join("\n");

let n = 0;
const p = (extra: Partial<EtalageProduct>): EtalageProduct => {
  n += 1;
  return { id: `p${n}`, slug: `p${n}`, name: `Product ${n}`, category: "Kleding", gender: null, collection: null, imageUrl: `/img/${n}.jpg`, price: 20, opVoorraad: true, ...extra };
};

const catalogus: EtalageProduct[] = [
  p({ category: "Kleding", gender: "heren", collection: "Winter 2026", price: 45 }),
  p({ category: "Kleding", gender: "heren", collection: "Winter 2026", price: 60 }),
  p({ category: "Kleding", gender: "vrouwen", price: 35 }),
  p({ category: "Kleding", gender: "vrouwen", price: 28 }),
  p({ category: "Werk & PBM", price: 12 }),
  p({ category: "Werk & PBM", price: 89 }),
  p({ category: "Werkdag", price: 9 }),
  p({ category: "Werkdag", price: 14, imageUrl: null }),
  p({ category: "Cadeaus", price: 18 }),
];

describe("Uitgelicht", () => {
  it("collecties eerst, dan categorie per doelgroep, dan categorieën; elke tegel met een eigen foto", () => {
    const tegels = ontdekTegels(catalogus);
    expect(tegels.map((t) => t.sleutel)).toEqual(["col-Winter 2026", "cat-Kleding-heren", "cat-Kleding-vrouwen", "cat-Kleding", "cat-Werk & PBM", "cat-Werkdag"]);
    expect(new Set(tegels.map((t) => t.foto)).size).toBe(tegels.length);
    expect(tegels[0]?.href).toBe("/shop?collectie=Winter%202026#collectie");
    expect(tegels[2]?.href).toBe("/shop?cat=Kleding&voor=vrouwen#collectie");
    // Cadeaus heeft maar één product: geen tegel
    expect(tegels.some((t) => t.cat === "Cadeaus")).toBe(false);
  });

  it("met te weinig groepen geen blok, en een groep van één product telt niet", () => {
    expect(ontdekTegels(catalogus.slice(0, 2))).toEqual([]);
    expect(ontdekTegels(catalogus, 3)).toHaveLength(0);
  });

  it("Sinterklaas tot en met 5 december, kerst tot en met 26 december, in Nederlandse tijd", () => {
    expect(seizoenVan(new Date("2026-11-15T12:00:00+01:00"))).toBe("sint");
    expect(seizoenVan(new Date("2026-12-05T23:30:00+01:00"))).toBe("sint");
    expect(seizoenVan(new Date("2026-12-05T23:30:00Z"))).toBe("kerst"); // al 6 december in Nederland
    expect(seizoenVan(new Date("2026-12-26T12:00:00+01:00"))).toBe("kerst");
    expect(seizoenVan(new Date("2026-12-27T12:00:00+01:00"))).toBeNull();
    expect(seizoenVan(new Date("2026-07-01T12:00:00+02:00"))).toBeNull();
  });
});

describe("thema's en cadeauhulp", () => {
  it("alleen thema's met producten erachter; het seizoen alleen in het seizoen", () => {
    const nov = themaKaarten(catalogus, new Date("2026-11-15T12:00:00+01:00"));
    expect(nov.map((t) => [t.sleutel, t.aantal])).toEqual([
      ["seizoen", 1],
      ["winter", 2],
      ["werk", 2],
      ["budget", 3],
      ["team", 4],
    ]);
    expect(nov.find((t) => t.sleutel === "budget")?.href).toBe("/shop?prijs=onder15#collectie");
    const zomer = themaKaarten(catalogus, new Date("2026-07-01T12:00:00+02:00"));
    expect(zomer.map((t) => t.sleutel)).not.toContain("seizoen");
    expect(themaKaarten(catalogus.filter((x) => x.category !== "Werk & PBM"), new Date("2026-07-01T12:00:00+02:00")).map((t) => t.sleutel)).not.toContain("werk");
  });

  it("de cadeauhulp biedt alleen keuzes die iets opleveren", () => {
    expect(cadeauKeuzes(catalogus).map((k) => [k.sleutel, k.aantal])).toEqual([
      ["heren", 2],
      ["vrouwen", 2],
      ["onder15", 3],
      ["15-30", 2],
      ["werk", 2],
    ]);
  });

  it("prijsklassen en adressen: streng gelezen", () => {
    expect([inPrijsklasse(14.99, "onder15"), inPrijsklasse(15, "15-30"), inPrijsklasse(30, "15-30"), inPrijsklasse(30.01, "vanaf30")]).toEqual([true, true, true, true]);
    expect(prijsUitAdres("onder15")).toBe("onder15");
    expect(prijsUitAdres("constructor")).toBeNull();
    expect(collectieUitAdres("winter 2026", ["Winter 2026", null])).toBe("Winter 2026");
    expect(collectieUitAdres("Zomer", ["Winter 2026"])).toBeNull();
  });
});

describe("Ontdek alles", () => {
  it("per categorie het aantal, de doelgroepen en de collecties", () => {
    const kleding = catalogusOverzicht(catalogus).find((k) => k.cat === "Kleding");
    expect(kleding?.aantal).toBe(4);
    expect(kleding?.links.map((l) => `${l.waarde} ${l.aantal}`)).toEqual(["heren 2", "vrouwen 2", "Winter 2026 2"]);
  });
});

describe("de pagina", () => {
  it("de nieuwe blokken staan in de indeling en op de pagina; een filter uit een blok toont meteen het assortiment", () => {
    const pagina = lees("app/shop/page.tsx");
    for (const id of ["ontdek", "themas", "cadeauhulp", "alles", "regelen"]) expect(pagina).toContain(`    ${id}: <Shop`);
    expect(pagina).toContain('initialVoor !== null || initialPrijs !== null || initialCollectie !== null');
    const etalage = lees("components/marketing/ShopStorefront.tsx");
    expect(etalage).toContain("(!collectie || p.collection === collectie)");
    expect(etalage).toContain('useState<PriceBucket>(initialPrijs ?? "Alle")');
  });

  it("geen verzonnen deals: geen doorgestreepte prijzen, adviesprijzen of aftellende aanbiedingen in de blokken", () => {
    // zonder de uitleg in het commentaar (die zegt juist dat er geen deals zijn)
    const blokken = (lees("components/marketing/ShopEtalage.tsx") + lees("lib/shop/etalage.ts"))
      .split("\n")
      .filter((r) => !/^\s*(\/\/|\*|\/\*\*)/.test(r))
      .join("\n");
    expect(blokken).not.toMatch(/line-through|adviesprijs|dagdeal|korting/i);
  });

  it("de veegrij van de thema's kan de pagina niet breder maken (relative bij overflow-x-auto)", () => {
    expect(lees("components/marketing/ShopEtalage.tsx")).toMatch(/className="relative [^"]*overflow-x-auto/);
  });

  it("alle nieuwe teksten staan in het Nederlands én het Engels", () => {
    const nl = lees("lib/i18n/dictionaries.ts");
    const en = lees("lib/i18n/dictionary-en.ts");
    for (const k of ["uitgelicht", "etalageSint", "etalageKerst", "groepVoor", "themaTitel", "themaWinter", "themaBudget", "cadeauTitel", "cadeauVoorHem", "cadeauZoek", "allesTitel", "regelenTitel", "hulpTitel"]) {
      expect(nl, k).toMatch(new RegExp(`\\n\\s+${k}: "`));
      expect(en, k).toMatch(new RegExp(`\\n\\s+${k}: "`));
    }
  });
});
