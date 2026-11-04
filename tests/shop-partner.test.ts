import { describe, expect, it } from "vitest";
import { isPartnerCode, maakPartnerCode, partnerStatus, partnerTotalen, partnerVergoedingCents } from "@/lib/shop/partner-core";

describe("partnerprogramma: vergoeding", () => {
  it("10% van het productbedrag zonder btw, naar beneden afgerond", () => {
    expect(partnerVergoedingCents(12100)).toBe(1000); // € 121 incl. = € 100 excl. → € 10
    expect(partnerVergoedingCents(2495)).toBe(206); // 2495 / 1,21 = 2061,98 → 206
    expect(partnerVergoedingCents(0)).toBe(0);
    expect(partnerVergoedingCents(-500)).toBe(0);
    expect(partnerVergoedingCents(Number.NaN)).toBe(0);
  });
});

describe("partnerprogramma: code", () => {
  it("maakt een leesbare, geldige code van de bedrijfsnaam", () => {
    expect(maakPartnerCode("Bakkerij Jansen B.V.", "K7Q2")).toBe("bakkerij-jansen-b-v-k7q2");
    expect(maakPartnerCode("Café ’t Hoekje", "ab12")).toBe("cafe-t-hoekje-ab12");
    expect(maakPartnerCode("!!!", "x9z8")).toBe("partner-x9z8");
    for (const c of ["bakkerij-jansen-b-v-k7q2", "cafe-t-hoekje-ab12", "partner-x9z8"]) expect(isPartnerCode(c)).toBe(true);
  });

  it("weigert alles wat geen code is", () => {
    for (const c of ["", "abc", "-abcd", "UPPER-abcd", "a b-abcd", "x".repeat(40) + "-abcd", null, 42]) expect(isPartnerCode(c)).toBe(false);
  });
});

describe("partnerprogramma: status en totalen", () => {
  const nu = new Date("2026-12-31T12:00:00Z");
  const dagenTerug = (n: number) => new Date(nu.getTime() - n * 86_400_000);

  it("volgt de bestelling: wacht, verdiend, vast, uitbetaald, vervallen", () => {
    expect(partnerStatus({ status: "PENDING_PAYMENT", createdAt: dagenTerug(1) }, false, nu)).toBe("wacht");
    expect(partnerStatus({ status: "RECEIVED", createdAt: dagenTerug(3) }, false, nu)).toBe("verdiend");
    expect(partnerStatus({ status: "SHIPPED", createdAt: dagenTerug(40) }, false, nu)).toBe("vast");
    expect(partnerStatus({ status: "SHIPPED", createdAt: dagenTerug(40) }, true, nu)).toBe("uitbetaald");
    expect(partnerStatus({ status: "CANCELLED", createdAt: dagenTerug(40) }, true, nu)).toBe("vervallen");
    expect(partnerStatus({ status: "PAYMENT_FAILED", createdAt: dagenTerug(1) }, false, nu)).toBe("vervallen");
  });

  it("telt alleen betaalde bestellingen mee", () => {
    const t = partnerTotalen([
      { status: "wacht", productenCents: 5000, vergoedingCents: 413 },
      { status: "verdiend", productenCents: 12100, vergoedingCents: 1000 },
      { status: "vast", productenCents: 2420, vergoedingCents: 200 },
      { status: "uitbetaald", productenCents: 1210, vergoedingCents: 100 },
      { status: "vervallen", productenCents: 9999, vergoedingCents: 826 },
    ]);
    expect(t).toEqual({ bestellingen: 3, omzetCents: 15730, verdiendCents: 1000, vastCents: 200, uitbetaaldCents: 100 });
  });
});
