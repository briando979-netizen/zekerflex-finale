import { describe, expect, it } from "vitest";
import { CJ_FOTO_MAX_PX, CJ_MAX_FOTOS, CLAIM_MAX_MS, categorieKeuze, categorieVanCj, doelgroepVanCj, fotosVan, goedkoopsteVerzending, herbruikbareWees, kleurEnMaat, leesCjProduct, leesCjTreffer, leesClaim, leesVoorraadPerVariant, lijktDuits, onzeSku, tekstUitHtml, uploadIdUitMediaUrl, usdCentsVan, voorraadVan, type WeesKandidaat } from "@/lib/shop/cj/cj-core";

// CJ Dropshipping lezen (18 nov 2026): dollars → centen, "Black-XL" → kleur en maat,
// foto's, voorraad, onze categorie en doelgroep. Alles puur, zonder netwerk.

describe("prijzen en foto's van CJ", () => {
  it("leest dollarbedragen, ook een bereik (het hoogste telt)", () => {
    expect(usdCentsVan("12.5")).toBe(1250);
    expect(usdCentsVan(3)).toBe(300);
    expect(usdCentsVan("12.5 -- 15.0")).toBe(1500);
    expect(usdCentsVan("4,99-6,49")).toBe(649);
    expect(usdCentsVan("")).toBeNull();
    expect(usdCentsVan(null)).toBeNull();
  });

  it("maakt één lijst foto's uit een lijst, JSON-tekst of los adres, alleen https en zonder dubbele", () => {
    expect(fotosVan("https://a/1.jpg", '["https://a/1.jpg","https://a/2.jpg","http://a/3.jpg"]', ["https://a/4.jpg"])).toEqual(["https://a/1.jpg", "https://a/2.jpg", "https://a/4.jpg"]);
    expect(fotosVan(undefined, "")).toEqual([]);
  });

  it("maakt gewone tekst van de HTML-omschrijving", () => {
    expect(tekstUitHtml("<p>Hello &amp; <b>world</b></p><ul><li>one</li><li>two</li></ul>")).toBe("Hello & world\none\ntwo");
    expect(tekstUitHtml("x".repeat(2000), 100)).toHaveLength(100);
  });
});

describe("kleur en maat uit de variantsleutel", () => {
  it.each([
    ["Black-XL", "Black", "XL"],
    ["XL", null, "XL"],
    ["Red", "Red", null],
    ["Navy Blue-42", "Navy Blue", "42"],
    ["M-Green", "Green", "M"],
    ["Blue-Set A", "Blue", "Set A"],
    ["One Size", null, "ONE SIZE"],
    ["", null, null],
  ])("%s → kleur %s, maat %s", (sleutel, kleur, maat) => {
    expect(kleurEnMaat(sleutel)).toEqual({ kleur, maat });
  });

  it("valt terug op de Engelse variantnaam", () => {
    expect(kleurEnMaat(undefined, "White-S")).toEqual({ kleur: "White", maat: "S" });
  });
});

describe("categorie en doelgroep", () => {
  it.each([
    ["Bluetooth Speakers", "Mini speaker", "Elektronica"],
    ["Toys & Hobbies", "Puzzle for kids", "Speelgoed"],
    ["Kids & Baby", "Kids hoodie", "Baby & kind"],
    ["Kids & Baby", "Baby shoes", "Baby & kind"],
    ["Men's Clothing", "Kids hoodie for boys", "Kleding"],
    ["Women's Clothing", "Summer dress", "Kleding"],
    ["Bags & Shoes", "Leather backpack", "Tassen & schoenen"],
    ["Jewelry", "Necklace", "Sieraden & horloges"],
    ["Home & Garden", "LED lamp", "Wonen & keuken"],
    ["Sports", "Yoga mat", "Sport & buiten"],
    ["Beauty & Health", "Hair brush", "Beauty & verzorging"],
    ["Safety", "Work gloves", "Werk & PBM"],
    ["", "Unknown thing", "Cadeaus"],
  ])("%s / %s → %s", (cat, naam, verwacht) => {
    expect(categorieVanCj(cat, naam)).toBe(verwacht);
  });

  it("een slim horloge is elektronica, een gewoon horloge een sieraad", () => {
    expect(categorieVanCj("Watches", "Smart watch with heart rate")).toBe("Elektronica");
    expect(categorieVanCj("Watches", "Quartz watch")).toBe("Sieraden & horloges");
  });

  // 18 nov: de eerste echte zoekopdracht ("kids toys") zette een zitzak onder tassen en speelgoed onder cadeaus
  it.each([
    ["Furniture", "Lazy Sofa Durable Comfort Lounger High-Back Bean Bag Chair", "Wonen & keuken"],
    ["Furniture", "Children's Bed House Bed With Chimney", "Wonen & keuken"],
    ["Furniture", "90x200cm Sofa Bed With Trundle Bed", "Wonen & keuken"],
    ["Furniture", "Kids Bouncy Castle, Inflatable Bouncer With Blower", "Speelgoed"],
    ["Furniture", "Kids Electric Car 12V Kids Car With Remote Control", "Speelgoed"],
    ["Event & Party Supplies", "2025 Advent Calendar: Cars, Toys For Boys Age 3-8", "Speelgoed"],
    ["Event & Party Supplies", "Building Block Train Track Set - 32-Piece City Train", "Speelgoed"],
    ["Event & Party Supplies", "Solar System Craft Kit With Wooden Pieces", "Speelgoed"],
    ["Event & Party Supplies", "2M 20 Owls Decor Fall String Lights Kids' Room", "Wonen & keuken"],
    ["Event & Party Supplies", "30-Piece Unicorn Hanging Swirls", "Feest & seizoen"],
    ["Event & Party Supplies", "30-Piece Dinosaur Spiral Garland", "Feest & seizoen"],
    ["Gift Boxes", "Wooden gift box", "Cadeaus"],
    ["Stationeries", "168 Color Dual Tip Art Markers Drawing Set", "Werkdag"],
    ["Lipstick", "Makeup Sets Kids Gift Box", "Beauty & verzorging"],
    ["Women's Clothing", "Lightweight jacket", "Kleding"],
    ["Lighting", "LED ring light for selfies", "Wonen & keuken"],
    ["Men's Clothing", "Baggy jeans", "Kleding"],
    // de acht categorieën van later op 18 nov
    ["Phone Cases", "Shockproof phone case for iPhone 15", "Telefoon & accessoires"],
    ["Consumer Electronics", "Wireless earbuds with charging case", "Elektronica"],
    ["Pet Supplies", "Dog leash with reflective strip", "Huisdieren"],
    ["Car Accessories", "Car phone holder for dashboard", "Auto & fiets"],
    ["Cycling", "Bike light USB rechargeable", "Auto & fiets"],
    ["Tools", "Cordless drill 21V", "Tuin & klussen"],
    ["Home & Garden", "Garden hose 30 m", "Tuin & klussen"],
    ["Health Care", "Neck massager with heat", "Gezondheid"],
    ["Beauty & Health", "Hair brush", "Beauty & verzorging"],
    ["Christmas", "Christmas tree ornaments set", "Feest & seizoen"],
    ["Video Games", "Wireless gamepad for PC", "Gaming & hobby"],
    ["Kids & Baby", "Baby stroller lightweight", "Baby & kind"],
    // uit de eerste 68 overgenomen producten (18 nov 03:00): dierenspeelgoed, gaming-stoelen, meubels, servetringen
    ["Pet Toys", "Cat Toy With 3 Replacement Feather Tufts", "Huisdieren"],
    ["Toys", "Blue Dog Toy Ball", "Huisdieren"],
    ["Toys", "Football for dogs", "Huisdieren"],
    ["Furniture", "Ergonomic gaming chair PU leather", "Gaming & hobby"],
    ["Furniture", "TV cabinet white grey", "Wonen & keuken"],
    ["Furniture", "Loft bed 140x200 with LED light", "Wonen & keuken"],
    ["Home Decor", "Napkin rings rose shape set of 6", "Wonen & keuken"],
    ["Consumer Electronics", "Wireless lavalier microphone", "Elektronica"],
    ["Christmas", "Christmas wooden house model kit", "Gaming & hobby"],
    ["Racing", "Steering wheel stand adjustable foldable", "Gaming & hobby"],
    ["Tools", "Electric hot glue gun", "Tuin & klussen"],
    ["Sports", "Professional dartboard", "Sport & buiten"],
    ["Toys", "Kids play shop box", "Speelgoed"],
    ["Toys & Hobbies", "Plush bear", "Speelgoed"],
  ])("%s / %s → %s", (cat, naam, verwacht) => {
    expect(categorieVanCj(cat, naam)).toBe(verwacht);
  });

  it("leest voor wie het is", () => {
    expect(doelgroepVanCj("Women's Clothing", "Dress")).toBe("vrouwen");
    expect(doelgroepVanCj("Men's Shoes", "Sneakers")).toBe("heren");
    expect(doelgroepVanCj("Kids & Baby", "Toy")).toBe("kinderen");
    expect(doelgroepVanCj("Clothing", "Unisex hoodie for men and women")).toBe("unisex");
    expect(doelgroepVanCj("Electronics", "Cable")).toBeNull();
  });

  it("de keuze van de beheerder gaat voor, maar alleen als het een echte categorie is", () => {
    expect(categorieKeuze("Speelgoed", "Cadeaus")).toBe("Speelgoed");
    expect(categorieKeuze("Onzin", "Cadeaus")).toBe("Cadeaus");
    expect(categorieKeuze(undefined, "Elektronica")).toBe("Elektronica");
  });
});

const PRODUCT = {
  pid: "P1",
  productNameEn: "Wireless Earbuds Pro",
  productSku: "CJ123",
  bigImage: "https://img/1.jpg",
  productImageSet: '["https://img/1.jpg","https://img/2.jpg"]',
  sellPrice: "9.9 -- 12.4",
  productWeight: "120.5",
  categoryName: "Consumer Electronics",
  description: "<p>Great <b>sound</b></p>",
  variants: [
    { vid: "V1", variantSku: "CJ123-BK", variantKey: "Black", variantSellPrice: 9.9, variantImage: "https://img/bk.jpg", inventories: [{ countryCode: "DE", totalInventory: 12 }, { countryCode: "CN", totalInventory: 500 }] },
    { vid: "V2", variantSku: "CJ123-WH", variantKey: "White", variantSellPrice: "12.4", inventories: [] },
    { variantSku: "", variantSellPrice: "1" },
  ],
};

describe("een heel product", () => {
  it("leest product en varianten; de inkoop is de hoogste variantprijs", () => {
    const p = leesCjProduct(PRODUCT);
    expect(p).not.toBeNull();
    expect(p!.pid).toBe("P1");
    expect(p!.sku).toBe("CJ123");
    expect(p!.categorie).toBe("Elektronica");
    expect(p!.fotos).toEqual(["https://img/1.jpg", "https://img/2.jpg"]);
    expect(p!.omschrijvingEn).toBe("Great sound");
    expect(p!.gewichtGram).toBe(121);
    expect(p!.inkoopUsdCents).toBe(1240);
    expect(p!.varianten).toHaveLength(2);
    expect(p!.varianten[0]).toMatchObject({ vid: "V1", sku: "CJ123-BK", kleur: "Black", maat: null, foto: "https://img/bk.jpg", inkoopUsdCents: 990, voorraad: 512 });
    expect(p!.varianten[1]).toMatchObject({ kleur: "White", inkoopUsdCents: 1240, voorraad: 0 });
  });

  it("zonder foto of prijs geen product", () => {
    expect(leesCjProduct({ ...PRODUCT, bigImage: "", productImageSet: "", productImage: "" })).toBeNull();
    expect(leesCjProduct({ ...PRODUCT, variants: [], sellPrice: "" })).toBeNull();
    expect(leesCjProduct(null)).toBeNull();
  });

  it("voorraad per land of in totaal", () => {
    expect(voorraadVan(PRODUCT.variants[0]!.inventories, "DE")).toBe(12);
    expect(voorraadVan(PRODUCT.variants[0]!.inventories)).toBe(512);
    expect(voorraadVan("x")).toBe(0);
  });

  it("leest een zoektreffer (oude en nieuwe veldnamen) en maakt een eigen sku", () => {
    expect(leesCjTreffer({ pid: "P2", productNameEn: "Plush bear", productImage: "https://img/p.jpg", sellPrice: "3.2", categoryName: "Toys", listedNum: 40 })).toEqual({
      pid: "P2", sku: "P2", naamEn: "Plush bear", foto: "https://img/p.jpg", inkoopUsdCents: 320, categorieCj: "Toys", categorie: "Speelgoed", gevoerd: 40,
    });
    expect(leesCjTreffer({ id: "P3", nameEn: "Cable", sku: "S3", bigImage: "https://img/c.jpg", sellPrice: 1 })?.sku).toBe("S3");
    expect(leesCjTreffer({ pid: "P4", productNameEn: "Geen prijs" })).toBeNull();
    expect(onzeSku("CJ123-BK/XL")).toBe("cj-cj123-bk-xl");
  });
});

describe("het slot op een pid (shop:cj:pid)", () => {
  const nu = Date.parse("2026-11-18T03:00:00Z");

  it("leest vrij, product, bezig en verlopen", () => {
    expect(leesClaim(null, nu)).toEqual({ soort: "vrij" });
    expect(leesClaim(undefined, nu)).toEqual({ soort: "vrij" });
    expect(leesClaim("prod_123", nu)).toEqual({ soort: "product", id: "prod_123" });
    expect(leesClaim({ bezig: "2026-11-18T02:55:00Z" }, nu)).toEqual({ soort: "bezig", sinds: "2026-11-18T02:55:00Z", verlopen: false });
    expect(leesClaim({ bezig: "2026-11-18T02:40:00Z" }, nu)).toEqual({ soort: "bezig", sinds: "2026-11-18T02:40:00Z", verlopen: true });
    expect(leesClaim({ bezig: "onzin" }, nu).soort).toBe("bezig");
    expect((leesClaim({ bezig: "onzin" }, nu) as { verlopen: boolean }).verlopen).toBe(true);
  });

  it("het oude losse woord 'bezig' (een import die door een herstart afbrak) is altijd verlopen", () => {
    expect(leesClaim("bezig", nu)).toEqual({ soort: "bezig", sinds: null, verlopen: true });
    expect(CLAIM_MAX_MS).toBe(15 * 60_000);
  });
});

describe("verzendkosten van CJ (freightCalculate)", () => {
  it("kiest de goedkoopste dienst en leest tekst- en getalprijzen", () => {
    const d = [
      { logisticName: "CJPacket Sensitive", logisticPrice: "7.35", logisticAging: "8-15" },
      { logisticName: "PostNL Packet", logisticPrice: 5.1, logisticAging: "6-12" },
      { logisticName: "Kapot", logisticPrice: "n.v.t." },
      null,
    ];
    expect(goedkoopsteVerzending(d)).toEqual({ usdCents: 510, dienst: "PostNL Packet", dagen: "6-12" });
  });

  it("zonder bruikbare dienst null (dan rekent de import met de schatting)", () => {
    expect(goedkoopsteVerzending([])).toBeNull();
    expect(goedkoopsteVerzending({ list: [] })).toBeNull();
    expect(goedkoopsteVerzending([{ logisticName: "x", logisticPrice: -1 }])).toBeNull();
  });
});

describe("voorraad per variant (getInventoryByPid) en Duits herkennen", () => {
  it("telt per variant alle magazijnen op, of alleen het gekozen land", () => {
    const d = {
      inventories: [{ countryCode: "CN", totalInventoryNum: 100 }],
      variantInventories: [
        { vid: "V1", inventory: [{ countryCode: "DE", totalInventory: 5 }, { countryCode: "CN", totalInventory: 100 }] },
        { vid: "V2", inventory: [] },
        null,
        { inventory: [{ countryCode: "CN", totalInventory: 9 }] },
      ],
    };
    expect([...leesVoorraadPerVariant(d).entries()]).toEqual([["V1", 105], ["V2", 0]]);
    expect(leesVoorraadPerVariant(d, "DE").get("V1")).toBe(5);
    expect(leesVoorraadPerVariant(null).size).toBe(0);
    expect(leesVoorraadPerVariant({ variantInventories: "x" }).size).toBe(0);
  });

  it("herkent een half Duitse vertaling, en laat gewoon Nederlands met rust", () => {
    expect(lijktDuits("Goldaufkleber 16 Stücke")).toBe(true);
    expect(lijktDuits("Sprühcabine Weiß")).toBe(true);
    expect(lijktDuits("Hoesje für iPhone")).toBe(true);
    expect(lijktDuits("Gaming stoel ergonomisch")).toBe(false);
    expect(lijktDuits("Set van 2 muurstickers met die leuke controller")).toBe(false);
    expect(lijktDuits("Kerst houten huismodel bouwset")).toBe(false);
  });
});

describe("foto's van CJ: grenzen en de eigen media-url", () => {
  it("hooguit 5 foto's van 1200 px (18 nov 2026: 6 × 2400 px was 721 MB op één dag)", () => {
    expect(CJ_MAX_FOTOS).toBe(5);
    expect(CJ_FOTO_MAX_PX).toBe(1200);
  });
  it("leest de upload-id uit /api/shop/media/<id>, ook met host of querystring; een vreemde url geeft null", () => {
    expect(uploadIdUitMediaUrl("/api/shop/media/cmwlitcra00039maap46p3dp6")).toBe("cmwlitcra00039maap46p3dp6");
    expect(uploadIdUitMediaUrl("https://zekerflex.com/api/shop/media/cmwlitcra00039maap46p3dp6?v=2")).toBe("cmwlitcra00039maap46p3dp6");
    expect(uploadIdUitMediaUrl("https://cdn.cj.example/foto.jpg")).toBeNull();
    expect(uploadIdUitMediaUrl("/api/shop/media/")).toBeNull();
    expect(uploadIdUitMediaUrl("/api/shop/media/../x")).toBeNull();
  });
});

describe("een halve import (wees) hergebruiken", () => {
  // 19 nov 2026: twee producten zonder foto, koppeling of pid-sleutel, van een import die afbrak na shopProduct.create.
  const wees: WeesKandidaat = { id: "p1", slug: "gouden-stickers", active: false, heeftKoppeling: false, inLijst: false, verkocht: false };

  it("een inactief product met dezelfde sku, zonder koppeling, niet in de lijst en nooit verkocht wordt hergebruikt", () => {
    expect(herbruikbareWees([wees])).toEqual(wees);
    // meerdere varianten van hetzelfde product tellen als één kandidaat
    expect(herbruikbareWees([wees, { ...wees }])).toEqual(wees);
  });

  it("alles wat op een echt product lijkt blijft met rust", () => {
    expect(herbruikbareWees([])).toBeNull();
    expect(herbruikbareWees([{ ...wees, active: true }])).toBeNull();
    expect(herbruikbareWees([{ ...wees, heeftKoppeling: true }])).toBeNull();
    expect(herbruikbareWees([{ ...wees, inLijst: true }])).toBeNull();
    expect(herbruikbareWees([{ ...wees, verkocht: true }])).toBeNull();
    // de sku's horen bij twee verschillende producten: niet raden, niets hergebruiken
    expect(herbruikbareWees([wees, { ...wees, id: "p2" }])).toBeNull();
  });
});
