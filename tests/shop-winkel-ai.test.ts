import { describe, expect, it } from "vitest";
import { STANDAARD_BELEID, inkoopAdvies, inkoopTotaal, leesBeleid, maakVarianten, margeVan, prijsUitInkoop, schoneKleuren, schoneMaten, slugVan } from "@/lib/shop/winkel-ai-core";

describe("prijs uit inkoop en marge", () => {
  it("rekent de marge op de verkoopprijs excl. btw en rondt af op x,95", () => {
    // inkoop € 10, marge 55 % → € 22,22 excl. → € 26,89 incl. → € 26,95
    const p = prijsUitInkoop(1000, 55, 0.21);
    expect(p.prijsCents).toBe(2695);
    expect(p.prijsCents % 100).toBe(95);
    expect(p.margeEchtPct).toBeGreaterThanOrEqual(55);
  });

  it("de echte marge is nooit lager dan gevraagd", () => {
    for (const inkoop of [123, 899, 2450, 7777]) for (const m of [30, 45, 60]) expect(prijsUitInkoop(inkoop, m).margeEchtPct).toBeGreaterThanOrEqual(m - 0.1);
  });

  it("boeken met 9 % btw en een bestaande prijs terugrekenen", () => {
    expect(prijsUitInkoop(1000, 50, 0.09).prijsCents).toBe(2195);
    expect(margeVan(2695, 1000, 0.21)).toBeCloseTo(55.1, 0);
    expect(margeVan(2695, null)).toBeNull();
  });
});

describe("beleid en varianten", () => {
  it("houdt het beleid binnen grenzen", () => {
    expect(leesBeleid({ margePct: 500, leverdagen: -3, doosGrootte: "x" })).toEqual({ ...STANDAARD_BELEID, margePct: 90, leverdagen: 1 });
    expect(leesBeleid(null)).toEqual(STANDAARD_BELEID);
  });

  it("schoont maten en kleuren op", () => {
    expect(schoneMaten(["s", "M", "m", " xl ", "reuze", "42", "39-42", "9999"])).toEqual(["S", "M", "XL", "42", "39-42"]);
    expect(schoneKleuren(["zwart", "Zwart", "marine blauw", "<b>", "x"])).toEqual(["Zwart", "Marine blauw"]);
  });

  it("maakt alle combinaties van maat en kleur met unieke sku's", () => {
    const v = maakVarianten("thermo-vest", ["S", "M"], ["Zwart", "Grijs"], 0);
    expect(v).toHaveLength(4);
    expect(new Set(v.map((x) => x.sku)).size).toBe(4);
    expect(v[0]).toMatchObject({ size: "S", color: "Zwart", stock: 0 });
    expect(maakVarianten("pet", [], [])).toEqual([{ size: null, color: null, stock: 0, sku: "pet" }]);
    expect(slugVan("Thermo-vest Dames — 2026!")).toBe("thermo-vest-dames-2026");
  });
});

describe("inkoopadvies", () => {
  const rij = (o: Partial<Parameters<typeof inkoopAdvies>[0][number]> = {}) => ({ variantId: "v", productNaam: "Hesje", size: "L", color: null, stock: 0, verkocht30: 0, inkoopCents: 200, ...o });

  it("bestelt voor levertijd plus dekking, in hele dozen, en toont de kosten", () => {
    // 30 verkocht in 30 dagen = 1 per dag; (7 + 28) dagen = 35, voorraad 10 → 25 → doos van 5 = 25
    const [r] = inkoopAdvies([rij({ stock: 10, verkocht30: 30 })]);
    expect(r).toMatchObject({ bestel: 25, reden: "loopt-leeg", kostenCents: 5000, dekkingDagen: 10 });
  });

  it("laat varianten met genoeg voorraad weg en zet de dringendste bovenaan", () => {
    const lijst = inkoopAdvies([rij({ variantId: "ruim", stock: 500, verkocht30: 30 }), rij({ variantId: "bijna", stock: 3, verkocht30: 30 }), rij({ variantId: "op", stock: 0, verkocht30: 30 })]);
    expect(lijst.map((r) => r.variantId)).toEqual(["op", "bijna"]);
    expect(lijst[0]?.reden).toBe("uitverkocht");
  });

  it("een uitverkochte variant zonder verkoopcijfers krijgt één doos als start", () => {
    const [r] = inkoopAdvies([rij({ stock: 0, verkocht30: 0 })]);
    expect(r).toMatchObject({ bestel: STANDAARD_BELEID.doosGrootte, reden: "geen-verkoop" });
  });

  it("totaliseert en telt regels zonder inkoopprijs apart", () => {
    const t = inkoopTotaal(inkoopAdvies([rij({ stock: 0, verkocht30: 30 }), rij({ variantId: "b", stock: 0, verkocht30: 30, inkoopCents: null })]));
    expect(t.zonderPrijs).toBe(1);
    expect(t.stuks).toBe(70);
    expect(t.kostenCents).toBe(35 * 200);
  });
});

describe("soort vastgelegd door de AI", () => {
  it("een product met een onbekende naam is toch te passen als de soort bekend is", async () => {
    const { pasvormVoor } = await import("@/lib/shop/paskamer");
    expect(pasvormVoor({ slug: "arctic-x", name: "Arctic X Pro" })).toBeNull();
    const p = pasvormVoor({ slug: "arctic-x", name: "Arctic X Pro", soort: "softshell", firstColor: "Zwart" });
    expect(p).toMatchObject({ systeem: "boven", kleur: "#1d1f22" });
    expect(p?.stukken[0]?.slot).toBe("jas");
    // kinderkleding krijgt kindermaten
    expect(pasvormVoor({ slug: "k", name: "K", gender: "kinderen", soort: "tshirt" })?.systeem).toBe("kind");
  });
});
