import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => undefined) }));

import { CONTENT_REGISTRY, contentKeys, getContentMap } from "@/lib/content/store";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { SHOP_TEKST_VELDEN, alleShopVelden, metShopTeksten, plaatshouders, shopTekstItems } from "@/lib/ontwerp/shop-teksten";

// Alle teksten van de webshop zijn aan te passen in de Site-ontwerper (tabblad Teksten, groepen "Webshop — …", 13 nov).
// Zonder eigen tekst is de webshop woord voor woord wat hij was; een eigen tekst geldt alleen in het Nederlands.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("het register", () => {
  it("elke tekst van de shop staat erin: de benoemde velden eerst, dan de rest uit het woordenboek", () => {
    const sleutels = contentKeys("shop.");
    expect(sleutels).toEqual(alleShopVelden(nl).map((v) => v.key));
    expect(sleutels.slice(0, SHOP_TEKST_VELDEN.length)).toEqual(SHOP_TEKST_VELDEN.map((v) => v.key));
    expect(SHOP_TEKST_VELDEN).toHaveLength(18);
    const teksten = [...Object.values(nl.shop), ...Object.values(nl.shopThuis)].filter((v) => typeof v === "string" && v.trim());
    expect(sleutels.length).toBe(teksten.length);
    expect(sleutels.length).toBeGreaterThan(150);
    expect(new Set(sleutels).size).toBe(sleutels.length);
  });

  it("de standaard is de Nederlandse woordenboektekst", () => {
    const perSleutel = new Map(CONTENT_REGISTRY.map((c) => [c.key, c]));
    expect(perSleutel.get("shop.heroTitel")?.default).toBe(nl.shopThuis.heroTitel);
    expect(perSleutel.get("shop.popular")?.default).toBe(nl.shop.popular);
    expect(perSleutel.get("shop.t.onlangsTitel")?.default).toBe(nl.shopThuis.onlangsTitel);
    expect(perSleutel.get("shop.x.navKleding")?.default).toBe(nl.shop.navKleding);
    for (const item of shopTekstItems(nl)) {
      expect(item.default.trim(), item.key).not.toBe("");
      expect(item.group, item.key).toMatch(/^Webshop — /);
      expect(item.label.trim(), item.key).not.toBe("");
    }
  });

  it("zonder eigen versie is elke waarde de standaard, dus het woordenboek blijft hetzelfde object", async () => {
    const waarden = await getContentMap(contentKeys("shop."));
    expect(metShopTeksten(nl, waarden, "nl")).toBe(nl);
  });
});

describe("eigen teksten toepassen", () => {
  it("een eigen tekst vervangt de Nederlandse, ook een tekst zonder eigen naam, en het oorspronkelijke woordenboek blijft heel", () => {
    const d = metShopTeksten(nl, { "shop.heroTitel": "Werkkleding met ons logo", "shop.popular": "Meest verkocht", "shop.t.onlangsTitel": "Laatst gezien", "shop.x.navKleding": "Mode" }, "nl");
    expect(d.shopThuis.heroTitel).toBe("Werkkleding met ons logo");
    expect(d.shop.popular).toBe("Meest verkocht");
    expect(d.shopThuis.onlangsTitel).toBe("Laatst gezien");
    expect(d.shop.navKleding).toBe("Mode");
    expect(d.shopThuis.heroSub).toBe(nl.shopThuis.heroSub);
    expect(nl.shopThuis.heroTitel).toBe("Kleding en werkkleding die met je meewerkt");
    expect(d.nav).toBe(nl.nav);
  });

  it("een andere taal houdt zijn vertaling", () => {
    expect(metShopTeksten(en, { "shop.heroTitel": "Werkkleding met ons logo" }, "en")).toBe(en);
    expect(metShopTeksten(en, { "shop.heroTitel": "Werkkleding met ons logo" }, "pl")).toBe(en);
  });

  it("leeg, alleen spaties of een onbekende sleutel verandert niets", () => {
    expect(metShopTeksten(nl, { "shop.heroTitel": "   ", "shop.bestaatNiet": "x", "shop.x.constructor": "y", constructor: "z" }, "nl")).toBe(nl);
  });

  it("een plaatshouder moet blijven staan: anders geldt de standaard", () => {
    expect(plaatshouders("Ontvang de code {code} en {n} dagen")).toEqual(["{code}", "{n}"]);
    expect(metShopTeksten(nl, { "shop.newsletterBody": "Schrijf je in voor nieuws." }, "nl")).toBe(nl);
    expect(metShopTeksten(nl, { "shop.newsletterBody": "Schrijf je in en krijg {code}." }, "nl").shop.newsletterBody).toBe("Schrijf je in en krijg {code}.");
    expect(metShopTeksten(nl, { "shop.t.kleurenLabel": "Tinten" }, "nl")).toBe(nl);
    expect(metShopTeksten(nl, { "shop.t.kleurenLabel": "Tinten: {kleuren}" }, "nl").shopThuis.kleurenLabel).toBe("Tinten: {kleuren}");
  });
});

describe("de pagina, de omlijsting en het paneel", () => {
  it("/shop past de eigen teksten toe vóór de onderdelen worden opgebouwd", () => {
    const src = bron("app/shop/page.tsx");
    expect(src).toContain('metShopTeksten(await getDict(), await getContentMap(contentKeys("shop.")).catch(() => ({})), await getLocale())');
    expect(src.indexOf("metShopTeksten(")).toBeLessThan(src.indexOf("const onderdelen"));
  });

  it("de omlijsting geeft de eigen teksten door aan de onderdelen in de browser, en alleen als er een eigen tekst is", () => {
    const src = bron("app/shop/layout.tsx");
    expect(src).toContain("metShopTeksten(nl, ");
    expect(src).toContain("t={eigen !== nl ? eigen : clientDict(locale)}");
  });

  it("het tabblad Webshop wijst naar het tabblad Teksten", () => {
    expect(bron("components/admin/ontwerper/ShopPaneel.tsx")).toContain("staan in het tabblad Teksten, onder Webshop");
  });
});
