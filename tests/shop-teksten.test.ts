import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/storage/kv", () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => undefined) }));

import { CONTENT_REGISTRY, contentKeys, getContentMap } from "@/lib/content/store";
import { nl } from "@/lib/i18n/dictionaries";
import { en } from "@/lib/i18n/dictionary-en";
import { SHOP_TEKST_VELDEN, metShopTeksten, shopTekstItems } from "@/lib/ontwerp/shop-teksten";

// De teksten van de voorpagina van de webshop zijn aan te passen in de Site-ontwerper (tabblad Teksten, groep Webshop, 13 nov).
// Zonder eigen tekst is de webshop woord voor woord wat hij was; een eigen tekst geldt alleen in het Nederlands.

const bron = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8").split("\r\n").join("\n");

describe("het register", () => {
  it("de webshopvelden staan in het tekstenregister, elk met de Nederlandse woordenboektekst als standaard", () => {
    const sleutels = contentKeys("shop.");
    expect(sleutels).toEqual(SHOP_TEKST_VELDEN.map((v) => v.key));
    expect(sleutels.length).toBe(18);
    const perSleutel = new Map(CONTENT_REGISTRY.map((c) => [c.key, c]));
    expect(perSleutel.get("shop.heroTitel")?.default).toBe(nl.shopThuis.heroTitel);
    expect(perSleutel.get("shop.popular")?.default).toBe(nl.shop.popular);
    expect(perSleutel.get("shop.newsletterBody")?.default).toContain("{code}");
    for (const item of shopTekstItems(nl)) {
      expect(item.default.trim(), item.key).not.toBe("");
      expect(item.group, item.key).toMatch(/^Webshop — /);
    }
  });

  it("zonder eigen versie is elke waarde de standaard, dus het woordenboek blijft ongewijzigd", async () => {
    const waarden = await getContentMap(contentKeys("shop."));
    expect(metShopTeksten(nl, waarden, "nl")).toBe(nl);
  });
});

describe("eigen teksten toepassen", () => {
  it("een eigen tekst vervangt de Nederlandse, en het oorspronkelijke woordenboek blijft heel", () => {
    const d = metShopTeksten(nl, { "shop.heroTitel": "Werkkleding met ons logo", "shop.popular": "Meest verkocht" }, "nl");
    expect(d.shopThuis.heroTitel).toBe("Werkkleding met ons logo");
    expect(d.shop.popular).toBe("Meest verkocht");
    expect(d.shopThuis.heroSub).toBe(nl.shopThuis.heroSub);
    expect(nl.shopThuis.heroTitel).toBe("Kleding en werkkleding die met je meewerkt");
    expect(d.nav).toBe(nl.nav);
  });

  it("een andere taal houdt zijn vertaling", () => {
    expect(metShopTeksten(en, { "shop.heroTitel": "Werkkleding met ons logo" }, "en")).toBe(en);
    expect(metShopTeksten(en, { "shop.heroTitel": "Werkkleding met ons logo" }, "pl")).toBe(en);
  });

  it("leeg, alleen spaties of een onbekende sleutel verandert niets", () => {
    expect(metShopTeksten(nl, { "shop.heroTitel": "   ", "shop.bestaatNiet": "x", constructor: "y" }, "nl")).toBe(nl);
  });

  it("de nieuwsbrieftekst zonder {code} blijft de standaard: de kortingscode mag niet wegvallen", () => {
    expect(metShopTeksten(nl, { "shop.newsletterBody": "Schrijf je in voor nieuws." }, "nl")).toBe(nl);
    const goed = metShopTeksten(nl, { "shop.newsletterBody": "Schrijf je in en krijg {code}." }, "nl");
    expect(goed.shop.newsletterBody).toBe("Schrijf je in en krijg {code}.");
  });
});

describe("de pagina en het paneel", () => {
  it("/shop past de eigen teksten toe vóór de onderdelen worden opgebouwd", () => {
    const src = bron("app/shop/page.tsx");
    expect(src).toContain('metShopTeksten(await getDict(), await getContentMap(contentKeys("shop.")).catch(() => ({})), await getLocale())');
    expect(src.indexOf("metShopTeksten(")).toBeLessThan(src.indexOf("const onderdelen"));
  });

  it("het tabblad Webshop wijst naar het tabblad Teksten", () => {
    expect(bron("components/admin/ontwerper/ShopPaneel.tsx")).toContain("staan in het tabblad Teksten, onder Webshop");
  });
});
