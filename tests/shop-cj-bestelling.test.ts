import { describe, expect, it } from "vitest";
import { cjOrderBody, cjOrderNumber, cjStatusTekst, isCjEind, leesCjOrder, magBetalen, provincieVanPostcode } from "@/lib/shop/cj/bestelling-core";

// Een webshopbestelling naar CJ (18 nov 2026): de body voor createOrderV2, het antwoord lezen, de provincie voor
// het etiket en de regel voor betalen uit het saldo. Alles puur.

describe("provincie uit de postcode (voor het etiket)", () => {
  it.each([
    ["1012 AB", "Noord-Holland"],
    ["1315JK", "Flevoland"],
    ["2511 CV", "Zuid-Holland"],
    ["3511 AB", "Utrecht"],
    ["4331 AA", "Zeeland"],
    ["5611 AZ", "Noord-Brabant"],
    ["6211 AB", "Limburg"],
    ["6811 AA", "Gelderland"],
    ["7511 AA", "Overijssel"],
    ["7811 AA", "Drenthe"],
    ["8911 AA", "Friesland"],
    ["9711 AA", "Groningen"],
    ["onzin", "Nederland"],
  ])("%s → %s", (pc, prov) => {
    expect(provincieVanPostcode(pc)).toBe(prov);
  });
});

const ORDER = { id: "ord_1", firstName: "Jan", lastName: "Jansen", email: "jan@example.test", address: "Dorpsstraat 1", postalCode: "9711aa", city: "Groningen" };

describe("de body voor createOrderV2", () => {
  it("alleen aanmaken (payType 3), netjes adres, provincie, en de proefstand", () => {
    const b = cjOrderBody(ORDER, [{ vid: "V1", quantity: 2, naam: "Oordopjes", sku: "cj-x-1" }], { van: "de", logistiek: "PostNL Packet", sandbox: true });
    expect(b).toMatchObject({
      orderNumber: "ZF-ord_1",
      shippingCountryCode: "NL",
      shippingCountry: "Netherlands",
      shippingProvince: "Groningen",
      shippingCity: "Groningen",
      shippingAddress: "Dorpsstraat 1",
      shippingZip: "9711 AA",
      shippingCustomerName: "Jan Jansen",
      email: "jan@example.test",
      fromCountryCode: "DE",
      logisticName: "PostNL Packet",
      payType: 3,
      isSandbox: 1,
      products: [{ vid: "V1", quantity: 2, storeProductName: "Oordopjes", storeSku: "cj-x-1" }],
    });
    expect(cjOrderBody(ORDER, [], { van: "CN", logistiek: "x", sandbox: false }).isSandbox).toBe(0);
    expect(cjOrderNumber("abc")).toBe("ZF-abc");
  });
});

describe("het antwoord van CJ lezen", () => {
  it("leest het antwoord van createOrderV2 en van getOrderDetail", () => {
    expect(leesCjOrder({ orderId: "CJ1", orderNumber: "ZF-ord_1", orderStatus: "CREATED", orderAmount: "12.34", productAmount: 9.9, postageAmount: "2.44" })).toEqual({
      cjOrderId: "CJ1", orderNumber: "ZF-ord_1", status: "CREATED", bedragUsdCents: 1234, productUsdCents: 990, verzendUsdCents: 244, logistiek: null, trackNumber: null, vervoerder: null,
    });
    expect(leesCjOrder({ orderId: "CJ1", orderNum: "ZF-ord_1", orderStatus: "shipped", logisticName: "PostNL Packet", trackNumber: "3S123", trackingProvider: "PostNL" })).toMatchObject({
      status: "SHIPPED", logistiek: "PostNL Packet", trackNumber: "3S123", vervoerder: "PostNL",
    });
    expect(leesCjOrder({})).toBeNull();
    expect(leesCjOrder(null)).toBeNull();
  });

  it("eindstatussen en gewone woorden", () => {
    expect(isCjEind("DELIVERED")).toBe(true);
    expect(isCjEind("cancelled")).toBe(true);
    expect(isCjEind("UNSHIPPED")).toBe(false);
    expect(cjStatusTekst("CREATED")).toBe("aangemaakt, nog niet betaald");
    expect(cjStatusTekst("PROCESSING")).toBe("betaald, wordt ingepakt");
    expect(cjStatusTekst("")).toBe("onbekend");
  });
});

describe("betalen uit het saldo: alleen onder de grens en met genoeg saldo", () => {
  it("keurt goed en af met een reden", () => {
    expect(magBetalen({ bedragEurCents: 2500, maxBetaalCents: 15000, saldoUsdCents: 10000, bedragUsdCents: 2700 })).toEqual({ ok: true, reden: null });
    expect(magBetalen({ bedragEurCents: 20000, maxBetaalCents: 15000, saldoUsdCents: 100000, bedragUsdCents: 21000 }).reden).toMatch(/grens per bestelling/);
    expect(magBetalen({ bedragEurCents: 2500, maxBetaalCents: 15000, saldoUsdCents: 1000, bedragUsdCents: 2700 }).reden).toMatch(/saldo/);
    expect(magBetalen({ bedragEurCents: 2500, maxBetaalCents: 15000, saldoUsdCents: null, bedragUsdCents: 2700 }).ok).toBe(true);
    expect(magBetalen({ bedragEurCents: null, maxBetaalCents: 15000, saldoUsdCents: 10000, bedragUsdCents: 2700 }).reden).toMatch(/dollarkoers/);
    expect(magBetalen({ bedragEurCents: 0, maxBetaalCents: 15000, saldoUsdCents: 10000, bedragUsdCents: null }).reden).toMatch(/geen bedrag/);
  });
});
