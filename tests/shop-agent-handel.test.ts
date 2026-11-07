import { describe, expect, it } from "vitest";
import {
  agentRegels,
  bedragenVanSessie,
  beeldLink,
  csvVeld,
  klantVanSessie,
  naarCsv,
  PRODUCT_KOLOMMEN,
  productCsv,
  productRijen,
  schoneTekst,
  stripeFoutNL,
  vasteVingerafdruk,
  voorraadCsv,
  wachtNaFout,
  type BekendeVariant,
  type CatalogusProduct,
} from "@/lib/shop/agent-handel";
import { verzendkostenVoor } from "@/lib/shop/verzending";

const BASIS = "https://zekerflex.com";

const product = (over: Partial<CatalogusProduct> = {}): CatalogusProduct => ({
  id: "prodhoodie0001",
  slug: "everyday-hoodie",
  name: "Everyday hoodie",
  description: "Zachte **hoodie** voor op de werkvloer. Zie https://zekerflex.com/shop",
  category: "Kleding",
  gender: "unisex",
  priceCents: 4995,
  imageUploadId: "upl0000000001",
  imageUrl: "/api/shop/media/upl0000000001",
  isBundle: false,
  active: true,
  sellerTenantId: null,
  sellerStatus: null,
  sellerName: null,
  variants: [
    { id: "varhoodies0001", sku: "everyday-hoodie-s", size: "S", color: "Zwart", priceCents: null, stock: 3 },
    { id: "varhoodiem0001", sku: "everyday-hoodie-m", size: "M", color: "Zwart", priceCents: 5495, stock: 0 },
  ],
  ...over,
});

describe("productlijst voor AI-assistenten", () => {
  it("maakt één regel per variant, met het variant-id als id en het product als groep", () => {
    const { rijen, overgeslagen } = productRijen([product()], BASIS);
    expect(overgeslagen).toEqual([]);
    expect(rijen).toHaveLength(2);
    const [s, m] = rijen;
    expect(s?.id).toBe("varhoodies0001");
    expect(s?.item_group_id).toBe("prodhoodie0001");
    expect(s?.mpn).toBe("everyday-hoodie-s");
    expect(s?.link).toBe("https://zekerflex.com/shop/everyday-hoodie");
    expect(s?.brand).toBe("ZekerFlex");
    expect(s?.price).toBe("49.95 EUR");
    expect(s?.availability).toBe("in_stock");
    expect(s?.inventory_quantity).toBe("3");
    expect(s?.size).toBe("S");
    expect(s?.color).toBe("Zwart");
    expect(s?.gender).toBe("unisex");
    expect(s?.tax_behavior).toBe("inclusive");
    // eigen prijs van de variant, en niet op voorraad
    expect(m?.price).toBe("54.95 EUR");
    expect(m?.availability).toBe("out_of_stock");
    expect(m?.inventory_quantity).toBe("0");
  });

  it("rekent verzending zoals de shop: € 4,95, gratis vanaf € 50", () => {
    const [r] = productRijen([product()], BASIS).rijen;
    expect(r?.shipping).toBe("NL:ALL:Standaard verzending:1-2:4.95 EUR");
    expect(r?.free_shipping_threshold).toBe("NL:ALL:Standaard verzending:50.00 EUR");
    expect(verzendkostenVoor(4999)).toBe(495);
    expect(verzendkostenVoor(5000)).toBe(0);
    expect(verzendkostenVoor(0)).toBe(0);
  });

  it("een verkoper op de marktplaats is het merk en verstuurt trager", () => {
    const [r] = productRijen([product({ sellerTenantId: "t1", sellerStatus: "goedgekeurd", sellerName: "Werkmode BV" })], BASIS).rijen;
    expect(r?.brand).toBe("Werkmode BV");
    expect(r?.shipping).toContain(":2-4:");
  });

  it("laat uit wat niet mag of niet kan, met de reden", () => {
    const { rijen, overgeslagen } = productRijen(
      [
        product({ id: "a000000001", name: "Uit", active: false }),
        product({ id: "a000000002", name: "Bundel", isBundle: true }),
        product({ id: "a000000003", name: "Nog niet goedgekeurd", sellerTenantId: "t1", sellerStatus: "in_beoordeling" }),
        product({ id: "a000000004", name: "Zonder foto", imageUploadId: null, imageUrl: null }),
        product({ id: "a000000005", name: "Zonder maat", variants: [] }),
      ],
      BASIS,
    );
    expect(rijen).toEqual([]);
    // wat in de shop uit staat, staat ook niet bij "niet in de lijst"
    expect(overgeslagen.map((o) => o.reden)).toEqual(["bundel (wordt als één product verkocht)", "verkopersproduct nog niet goedgekeurd", "geen foto", "geen maat of variant"]);
  });

  it("een vast id uit de beginvoorraad (shop_hoodie) krijgt ook een foto-adres", () => {
    expect(beeldLink({ id: "shop_hoodie", imageUrl: "/shop/hoodie.webp", imageUploadId: null }, BASIS)).toBe("https://zekerflex.com/api/shop/beeld/shop_hoodie.jpg");
  });

  it("een JPEG uit public/ gaat rechtstreeks, al het andere via de JPEG-route", () => {
    expect(beeldLink({ id: "p1", imageUrl: "/shop/werkschoen.jpg", imageUploadId: null }, BASIS)).toBe("https://zekerflex.com/shop/werkschoen.jpg");
    expect(beeldLink({ id: "p1", imageUrl: "/shop/werkschoen.webp", imageUploadId: null }, BASIS)).toBe("https://zekerflex.com/api/shop/beeld/p1.jpg");
    expect(beeldLink({ id: "p1", imageUrl: "/api/shop/media/x", imageUploadId: "x" }, BASIS)).toBe("https://zekerflex.com/api/shop/beeld/p1.jpg");
    expect(beeldLink({ id: "p1", imageUrl: "https://elders.example/foto.jpg", imageUploadId: null }, BASIS)).toBeNull();
    expect(beeldLink({ id: "p1", imageUrl: "//elders.example/foto.jpg", imageUploadId: null }, BASIS)).toBeNull();
  });

  it("de omschrijving is platte tekst zonder links", () => {
    expect(schoneTekst("Zachte **hoodie**. [Meer](https://x.example) Zie https://zekerflex.com/shop")).toBe("Zachte hoodie. Meer Zie");
  });

  it("CSV-velden met komma, aanhalingsteken of regeleinde staan tussen aanhalingstekens", () => {
    expect(csvVeld("gewoon")).toBe("gewoon");
    expect(csvVeld("a,b")).toBe('"a,b"');
    expect(csvVeld('zeg "hoi"')).toBe('"zeg ""hoi"""');
    expect(csvVeld("regel 1\nregel 2")).toBe('"regel 1\nregel 2"');
    expect(naarCsv(["id", "x"], [{ id: "1", x: "a,b" }])).toBe('id,x\r\n1,"a,b"\r\n');
    const csv = productCsv(productRijen([product()], BASIS).rijen);
    expect(csv.split("\r\n")[0]).toBe(PRODUCT_KOLOMMEN.join(","));
    expect(voorraadCsv(productRijen([product()], BASIS).rijen)).toBe("id,availability,inventory_quantity\r\nvarhoodies0001,in_stock,3\r\nvarhoodiem0001,out_of_stock,0\r\n");
  });

  it("voorraad en prijs veranderen de vaste vingerafdruk niet, een nieuwe titel wel", () => {
    const basis = vasteVingerafdruk(productRijen([product()], BASIS).rijen);
    const meerVoorraad = product();
    meerVoorraad.variants = meerVoorraad.variants.map((v) => ({ ...v, stock: v.stock + 10, priceCents: 1000 }));
    expect(vasteVingerafdruk(productRijen([meerVoorraad], BASIS).rijen)).toBe(basis);
    expect(vasteVingerafdruk(productRijen([product({ name: "Nieuwe naam" })], BASIS).rijen)).not.toBe(basis);
  });

  it("wacht steeds langer na een fout, hooguit 6 uur", () => {
    expect(wachtNaFout(1)).toBe(15 * 60_000);
    expect(wachtNaFout(2)).toBe(30 * 60_000);
    expect(wachtNaFout(20)).toBe(6 * 3_600_000);
  });

  it("zegt een fout van Stripe in gewoon Nederlands", () => {
    expect(stripeFoutNL(404, "Not found")).toContain("staat nog niet aan in Stripe");
    expect(stripeFoutNL(401, undefined)).toContain("sleutel");
    expect(stripeFoutNL(400, "Invalid feed_type")).toBe("Stripe weigerde het verzoek (400): Invalid feed_type.");
  });
});

describe("bestelling via een AI-assistent", () => {
  const varianten = new Map<string, BekendeVariant>([
    ["varhoodies0001", { id: "varhoodies0001", size: "S", color: "Zwart", product: { id: "prodhoodie0001", name: "Everyday hoodie", imageUrl: "/api/shop/media/x", sellerTenantId: null } }],
    ["varschoen00001", { id: "varschoen00001", size: "43", color: null, product: { id: "prodschoen0001", name: "Werkschoen", imageUrl: null, sellerTenantId: "t1" } }],
  ]);

  const sessie = {
    id: "cs_test_1",
    amount_total: 15485,
    amount_subtotal: 15485,
    total_details: { amount_shipping: 0 },
    payment_intent: "pi_1",
    customer_details: { name: "Jan de Vries", email: "Jan@Voorbeeld.TEST" },
    collected_information: { shipping_details: { name: "Jan de Vries", address: { line1: "Dorpsstraat 1", line2: "bis", postal_code: "1234 ab", city: "Utrecht", country: "NL" } } },
    line_items: {
      data: [
        { quantity: 2, amount_total: 9990, price: { external_reference: "varhoodies0001", unit_amount: 4995 } },
        { quantity: 1, amount_total: 5495, price: { external_reference: "varschoen00001", unit_amount: 5495 } },
      ],
    },
  };

  it("zet de regels op onze varianten, met maat en verkoper", () => {
    const regels = agentRegels(sessie, varianten);
    expect(regels).toEqual([
      { variantId: "varhoodies0001", productId: "prodhoodie0001", name: "Everyday hoodie — S / Zwart", priceCents: 4995, qty: 2, imageUrl: "/api/shop/media/x", size: "S", color: "Zwart" },
      { variantId: "varschoen00001", productId: "prodschoen0001", name: "Werkschoen — 43", priceCents: 5495, qty: 1, imageUrl: null, size: "43", color: null, sellerTenantId: "t1" },
    ]);
  });

  it("een sessie zonder een enkele regel van ons is geen bestelling van ons", () => {
    expect(agentRegels({ id: "cs_2", line_items: { data: [{ quantity: 1, amount_total: 100, price: { external_reference: "iets-anders" } }] } }, varianten)).toBeNull();
    expect(agentRegels({ id: "cs_3" }, varianten)).toBeNull();
  });

  it("een onbekende regel naast een bekende blijft staan met de naam van Stripe", () => {
    const regels = agentRegels(
      { id: "cs_4", line_items: { data: [sessie.line_items.data[0]!, { quantity: 1, amount_total: 250, price: { external_reference: "weg", product: { name: "Oud product" } } }] } },
      varianten,
    );
    expect(regels?.[1]).toEqual({ name: "Oud product", priceCents: 250, qty: 1 });
  });

  it("leest naam, e-mail en afleveradres", () => {
    expect(klantVanSessie(sessie)).toEqual({ firstName: "Jan", lastName: "de Vries", email: "jan@voorbeeld.test", address: "Dorpsstraat 1 bis", postalCode: "1234 AB", city: "Utrecht" });
    expect(klantVanSessie({ id: "x", customer_details: { name: "Cher", address: { city: "Antwerpen", country: "BE" } } }).city).toBe("Antwerpen (BE)");
  });

  it("neemt de bedragen over zoals Stripe ze rekende", () => {
    const regels = agentRegels(sessie, varianten) ?? [];
    expect(bedragenVanSessie(sessie, regels)).toEqual({ subtotalCents: 15485, shippingCents: 0, totalCents: 15485 });
    expect(bedragenVanSessie({ id: "x", total_details: { amount_shipping: 495 } }, [{ name: "a", priceCents: 1000, qty: 2 }])).toEqual({ subtotalCents: 2000, shippingCents: 495, totalCents: 2495 });
  });
});
