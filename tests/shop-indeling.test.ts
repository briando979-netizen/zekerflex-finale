import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHOP_SECTIES, isStandaardShopIndeling, normalizeShopIndeling, standaardShopIndeling, zichtbareShopSecties } from "@/lib/ontwerp/shop-indeling";

// De indeling van de webshop (Site-ontwerper, tabblad Webshop, 13 nov): de onderdelen onder de kop verslepen en verbergen.
// Zonder eigen indeling is /shop precies zoals hij was.

const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/storage/kv", () => ({
  kvGet: async (k: string) => kv.get(k) ?? null,
  kvSet: async (k: string, v: unknown) => void kv.set(k, v),
  kvDelete: async (k: string) => void kv.delete(k),
}));

import { getShopIndeling, resetShopIndeling, setShopIndeling } from "@/lib/ontwerp/shop-indeling-store";

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");
const OUD = ["categorieen", "looks", "populair", "onlangs", "paskamer", "assortiment", "meer", "service", "nieuwsbrief"];

beforeEach(() => kv.clear());

describe("de standaard is de oude webshop", () => {
  it("dezelfde onderdelen in dezelfde volgorde, niets verborgen", () => {
    expect(standaardShopIndeling()).toEqual({ volgorde: OUD, verborgen: [] });
    expect(zichtbareShopSecties(null, false)).toEqual(OUD);
    expect(isStandaardShopIndeling(standaardShopIndeling())).toBe(true);
  });

  it("wie zoekt of een categorie kiest ziet alleen het assortiment en wat eronder hoort, zoals voorheen", () => {
    expect(zichtbareShopSecties(null, true)).toEqual(["assortiment", "meer", "service", "nieuwsbrief"]);
  });

  it("de pagina toont de onderdelen in de volgorde van de indeling; de kop en de achtergrond blijven bovenaan", () => {
    const src = bron("app/shop/page.tsx");
    expect(src).toContain("zichtbareShopSecties(await getShopIndeling(), browsing)");
    expect(src.indexOf("<ShopThuisHero")).toBeLessThan(src.indexOf("zichtbaar.map("));
    // de foto in de kop vervangt de losse achtergrondstrook: geen dubbel beeld bovenaan
    expect(src).not.toContain("<PaginaAchtergrond");
    for (const s of SHOP_SECTIES) expect(src, s.id).toContain(`    ${s.id}: `);
    // "Populair" staat er alleen met vijf producten, zoals voorheen
    expect(src).toContain("populair: featured.length === 5 ?");
  });
});

describe("een eigen indeling", () => {
  it("verslepen en verbergen", () => {
    const i = normalizeShopIndeling({ volgorde: ["assortiment", "paskamer", ...OUD], verborgen: ["looks", "nieuwsbrief"] });
    expect(i.volgorde.slice(0, 2)).toEqual(["assortiment", "paskamer"]);
    expect(i.volgorde).toHaveLength(OUD.length);
    expect(zichtbareShopSecties(i, false)).toEqual(["assortiment", "paskamer", "categorieen", "populair", "onlangs", "meer", "service"]);
    expect(zichtbareShopSecties(i, true)).toEqual(["assortiment", "meer", "service"]);
    expect(isStandaardShopIndeling(i)).toBe(false);
  });

  it("het assortiment is nooit te verbergen, en onbekende of dubbele onderdelen vallen weg", () => {
    const i = normalizeShopIndeling({ volgorde: ["looks", "looks", "constructor", 7, "meer"], verborgen: ["assortiment", "toString", "looks", "looks"] });
    expect(i.verborgen).toEqual(["looks"]);
    expect(i.volgorde.slice(0, 2)).toEqual(["looks", "meer"]);
    expect(new Set(i.volgorde).size).toBe(OUD.length);
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
