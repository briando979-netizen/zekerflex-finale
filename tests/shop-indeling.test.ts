import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHOP_SECTIES, isStandaardShopIndeling, normalizeShopIndeling, standaardShopIndeling, zichtbareShopSecties } from "@/lib/ontwerp/shop-indeling";

// De indeling van de webshop (Site-ontwerper, tabblad Webshop, 13 nov): de onderdelen onder de kop verslepen en verbergen.
// Zonder eigen indeling is /shop de voorpagina zoals bol.com (15 nov, stap 6, lib/shop/etalage.ts): de oude onderdelen in de oude
// volgorde, met Uitgelicht, Thema's, Cadeauhulp, Ontdek alles en Snel regelen ertussen. Een eerder bewaarde indeling houdt zijn
// volgorde; nieuwe onderdelen komen daar achteraan (er stond op 15 nov geen eigen indeling op de server).

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
}));

import { getShopIndeling, resetShopIndeling, setShopIndeling } from "@/lib/ontwerp/shop-indeling-store";

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
// 18 nov: het paskamer-promoblok is van /shop gehaald (de pagina /shop/paskamer bestaat nog)
const OUD = ["categorieen", "looks", "populair", "onlangs", "assortiment", "meer", "service", "nieuwsbrief"];
const STANDAARD = ["ontdek", "categorieen", "themas", "looks", "populair", "cadeauhulp", "onlangs", "assortiment", "alles", "meer", "service", "regelen", "nieuwsbrief"];

beforeEach(() => kv.clear());

describe("de standaard: de oude onderdelen in de oude volgorde, met de blokken van stap 6 ertussen", () => {
  it("dezelfde onderdelen in dezelfde volgorde, niets verborgen", () => {
    expect(standaardShopIndeling()).toEqual({ volgorde: STANDAARD, verborgen: [] });
    expect(zichtbareShopSecties(null, false)).toEqual(STANDAARD);
    // de oude onderdelen houden hun onderlinge volgorde
    expect(STANDAARD.filter((id) => OUD.includes(id))).toEqual(OUD);
    expect(isStandaardShopIndeling(standaardShopIndeling())).toBe(true);
  });

  it("wie zoekt of een categorie kiest ziet alleen het assortiment en wat eronder hoort, zoals voorheen", () => {
    expect(zichtbareShopSecties(null, true)).toEqual(["assortiment", "meer", "service", "regelen", "nieuwsbrief"]);
  });

  it("de pagina toont de onderdelen in de volgorde van de indeling; een gekozen achtergrond blijft bovenaan, de kop is weg (18 nov)", () => {
    const src = bron("app/shop/page.tsx");
    expect(src).toContain("zichtbareShopSecties(await getShopIndeling(), browsing)");
    expect(src.indexOf('<PaginaAchtergrond pagina="shop" />')).toBeLessThan(src.indexOf("zichtbaar.map("));
    expect(src).not.toContain("ShopThuisHero");
    expect(src).not.toContain("ShopPaskamerPromo");
    for (const s of SHOP_SECTIES) expect(src, s.id).toContain(`    ${s.id}: `);
    // "Populair" staat er alleen met vijf producten, zoals voorheen
    expect(src).toContain("populair: featured.length === 5 ?");
  });
});

describe("een eigen indeling", () => {
  it("verslepen en verbergen", () => {
    const i = normalizeShopIndeling({ volgorde: ["assortiment", "populair", "paskamer", ...OUD], verborgen: ["looks", "nieuwsbrief"] });
    // "paskamer" bestaat niet meer en valt weg, zoals elk onbekend onderdeel
    expect(i.volgorde.slice(0, 2)).toEqual(["assortiment", "populair"]);
    expect(i.volgorde).toHaveLength(STANDAARD.length);
    // een bewaarde indeling van vóór stap 6: de nieuwe onderdelen komen achteraan
    expect(zichtbareShopSecties(i, false)).toEqual(["assortiment", "populair", "categorieen", "onlangs", "meer", "service", "ontdek", "themas", "cadeauhulp", "alles", "regelen"]);
    expect(zichtbareShopSecties(i, true)).toEqual(["assortiment", "meer", "service", "regelen"]);
    expect(isStandaardShopIndeling(i)).toBe(false);
  });

  it("het assortiment is nooit te verbergen, en onbekende of dubbele onderdelen vallen weg", () => {
    const i = normalizeShopIndeling({ volgorde: ["looks", "looks", "constructor", 7, "meer"], verborgen: ["assortiment", "toString", "looks", "looks"] });
    expect(i.verborgen).toEqual(["looks"]);
    expect(i.volgorde.slice(0, 2)).toEqual(["looks", "meer"]);
    expect(new Set(i.volgorde).size).toBe(STANDAARD.length);
    expect(zichtbareShopSecties(i, false)).toContain("assortiment");
  });

  it("onleesbare invoer geeft de standaard", () => {
    for (const raw of [null, undefined, "x", 3, [], { volgorde: "x", verborgen: 4 }]) expect(normalizeShopIndeling(raw)).toEqual(standaardShopIndeling());
  });
});

describe("de opslag", () => {
  it("geen eigen versie = null; bewaren en teruglezen; gelijk aan de standaard wist de sleutel", async () => {
    expect(await getShopIndeling()).toBeNull();
    const eigen = await setShopIndeling({ volgorde: ["assortiment", ...OUD], verborgen: ["service"] });
    expect(eigen?.volgorde[0]).toBe("assortiment");
    expect((await getShopIndeling())?.verborgen).toEqual(["service"]);
    expect(await setShopIndeling(standaardShopIndeling())).toBeNull();
    expect(kv.has("ontwerp:shop-indeling")).toBe(false);
  });

  it("terug naar de standaard", async () => {
    await setShopIndeling({ volgorde: OUD, verborgen: ["looks"] });
    await resetShopIndeling();
    expect(await getShopIndeling()).toBeNull();
  });
});

describe("het tabblad en de route", () => {
  it("de ontwerper heeft een tabblad Webshop, met verslepen", () => {
    expect(bron("lib/ontwerp/tabs.ts")).toContain('{ id: "shop", label: "Webshop" }');
    const paneel = bron("components/admin/ontwerper/ShopPaneel.tsx");
    expect(paneel).toContain("{...sleep.lijst}");
    expect(paneel).toContain("<SleepGreep");
    expect(paneel).toContain("disabled={vast}");
  });

  it("de route is alleen voor de platformbeheerder", () => {
    const route = bron("app/api/admin/ontwerp/shop/route.ts");
    expect(route.match(/withAdminAccess\(\["PLATFORM_ADMIN"\]/g) ?? []).toHaveLength(3);
  });
});
