import { describe, expect, it } from "vitest";
import { ZONDER_PAR_REGEL, apvcBelasting, autorisatieBelasting, berekenFranchise, teLaatKosten } from "@/lib/accountant/franchise";

describe("Delaware franchise tax: authorized shares-methode", () => {
  it("volgt de voorbeelden van Delaware zelf", () => {
    expect(autorisatieBelasting(5000)).toBe(175);
    expect(autorisatieBelasting(10_000)).toBe(250);
    expect(autorisatieBelasting(10_005)).toBe(335); // Delaware: 10.005 aandelen = $335
    expect(autorisatieBelasting(100_000)).toBe(1015); // Delaware: 100.000 aandelen = $1.015
  });
  it("10 miljoen aandelen geeft $85.165, het bedrag dat Delaware vaak op de rekening zet", () => {
    expect(autorisatieBelasting(10_000_000)).toBe(85_165);
  });
  it("stopt bij het maximum van $200.000", () => {
    expect(autorisatieBelasting(50_000_000)).toBe(200_000);
  });
  it("neemt rare invoer niet over", () => {
    expect(autorisatieBelasting(-5)).toBe(175);
    expect(autorisatieBelasting(Number.NaN)).toBe(175);
  });
});

describe("Delaware franchise tax: assumed par value capital-methode", () => {
  it("een kleine startup betaalt het minimum van $400", () => {
    const a = apvcBelasting({ geautoriseerd: 10_000_000, uitgegeven: 10_000_000, grossAssets: 100, nominaal: 0.00001 });
    expect(a?.belasting).toBe(400);
    expect(a?.assumedPar).toBe(0.00001);
    expect(a?.capital).toBe(100);
  });
  it("rekent per begonnen $1.000.000", () => {
    const a = apvcBelasting({ geautoriseerd: 10_000_000, uitgegeven: 5_000_000, grossAssets: 25_000_000, nominaal: 0.01 });
    expect(a?.assumedPar).toBe(5);
    expect(a?.capital).toBe(50_000_000);
    expect(a?.belasting).toBe(20_000);
    const b = apvcBelasting({ geautoriseerd: 1_000_000, uitgegeven: 1_000_000, grossAssets: 1_500_000, nominaal: 0.0001 });
    expect(b?.capital).toBe(1_500_000);
    expect(b?.belasting).toBe(800); // twee begonnen miljoenen
  });
  it("een nominale waarde boven de assumed par telt met die nominale waarde", () => {
    const a = apvcBelasting({ geautoriseerd: 1_000_000, uitgegeven: 1_000_000, grossAssets: 1000, nominaal: 2 });
    expect(a?.capital).toBe(2_000_000);
    expect(a?.belasting).toBe(800);
  });
  it("zonder par value geldt de tweede methode niet (Delaware: no par value stock)", () => {
    // Met 0 als par value kwam de som eerst ten onrechte uit op het minimum van $400.
    expect(apvcBelasting({ geautoriseerd: 10_000_000, uitgegeven: 10_000_000, grossAssets: 100, nominaal: 0 })).toBeNull();
  });
  it("zonder uitgegeven aandelen valt er niets te berekenen", () => {
    expect(apvcBelasting({ geautoriseerd: 100, uitgegeven: 0, grossAssets: 5, nominaal: 0 })).toBeNull();
  });
});

describe("berekenFranchise", () => {
  const zekerflex = { geautoriseerd: 10_000_000, uitgegeven: 10_000_000, grossAssets: 100, nominaal: 0.00001 };
  it("kiest de gunstigste methode en telt de annual report fee erbij", () => {
    const u = berekenFranchise(zekerflex);
    expect(u.gunstigste).toBe("apvc");
    expect(u.belasting).toBe(400);
    expect(u.annualReportFee).toBe(50);
    expect(u.totaal).toBe(450);
    expect(u.verschil).toBe(84_765);
    expect(u.apvcMethode?.uitleg.length).toBe(3);
  });
  it("zonder gegevens voor de tweede methode geldt de eerste", () => {
    const u = berekenFranchise({ ...zekerflex, uitgegeven: 0 });
    expect(u.apvcMethode).toBeNull();
    expect(u.gunstigste).toBeNull();
    expect(u.belasting).toBe(85_165);
  });
  it("zonder par value: $85.165 met de zin van Delaware als uitleg", () => {
    const u = berekenFranchise({ ...zekerflex, nominaal: 0 });
    expect(u.apvcMethode).toBeNull();
    expect(u.belasting).toBe(85_165);
    expect(u.totaal).toBe(85_215);
    expect(u.apvcNiet).toContain(ZONDER_PAR_REGEL);
    expect(berekenFranchise(zekerflex).apvcNiet).toBeNull();
    expect(berekenFranchise({ ...zekerflex, uitgegeven: 0 }).apvcNiet).toMatch(/uitgegeven aandelen/);
  });
  it("te laat: $200 boete plus 1,5% rente per maand over belasting en boete", () => {
    expect(teLaatKosten(400, 0)).toBe(0);
    expect(teLaatKosten(400, 1)).toBe(209);
    expect(teLaatKosten(400, 2)).toBe(218);
  });
});
