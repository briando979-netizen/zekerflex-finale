import { describe, expect, it } from "vitest";
import { AFWIJZING, analyseerCoin, analyseerReeks, kiesKansen, parseYahoo, risicoVan, soortCoin, voorstelBedragCents, type Koers } from "@/lib/markten/core";

const reeks = (prijzen: number[]): Koers[] => prijzen.map((slot, i) => ({ datum: `2026-10-${String(i + 1).padStart(2, "0")}`, slot }));
const lijn = (van: number, tot: number, n = 32) => Array.from({ length: n }, (_, i) => van + ((tot - van) * i) / (n - 1));

describe("koersen inlezen", () => {
  it("leest een Yahoo-antwoord, slaat lege dagen over en sorteert op datum", () => {
    const json = { chart: { result: [{ timestamp: [1793750400, 1793664000, 1793836800], indicators: { quote: [{ close: [2020.5, 2000, null] }] } }] } };
    expect(parseYahoo(json)).toEqual([{ datum: "2026-11-03", slot: 2000 }, { datum: "2026-11-04", slot: 2020.5 }]);
    expect(parseYahoo(null)).toEqual([]);
    expect(parseYahoo({ chart: { result: [] } })).toEqual([]);
  });
});

describe("analyse van een koersreeks", () => {
  it("een gestage stijging boven het gemiddelde is een sterke stijging", () => {
    const a = analyseerReeks({ id: "x", naam: "X", soort: "tech" }, reeks(lijn(100, 130)));
    expect(a?.signaal).toBe("sterke-stijging");
    expect(a?.r7).toBeGreaterThan(5);
    expect(a?.boven20).toBe(true);
  });

  it("een extreem snelle stijging is oververhit", () => {
    expect(analyseerReeks({ id: "x", naam: "X", soort: "memecoin" }, reeks([...lijn(100, 105, 25), 110, 120, 135, 150, 170, 190, 210]))?.signaal).toBe("oververhit");
  });

  it("een flinke daling met herstel is herstel, zonder herstel een dip", () => {
    const herstel = analyseerReeks({ id: "x", naam: "X", soort: "crypto" }, reeks([...lijn(100, 70, 26), 70, 71, 72, 73, 74, 75]));
    expect(herstel?.signaal).toBe("herstel");
    const dip = analyseerReeks({ id: "x", naam: "X", soort: "crypto" }, reeks([...lijn(100, 70, 26), 70, 70, 69, 69, 68, 68]));
    expect(dip?.signaal).toBe("dip");
  });

  it("hevige schommelingen zijn onrustig en een te korte reeks geeft niets", () => {
    const wild = Array.from({ length: 32 }, (_, i) => (i % 2 === 0 ? 100 : 115));
    expect(analyseerReeks({ id: "x", naam: "X", soort: "crypto" }, reeks(wild))?.signaal).toBe("onrustig");
    expect(analyseerReeks({ id: "x", naam: "X", soort: "crypto" }, reeks([1, 2, 3]))).toBeNull();
  });

  it("memecoins en cryptomunten krijgen meer risico dan goud", () => {
    expect(risicoVan(3, "memecoin")).toBeGreaterThan(risicoVan(3, "crypto"));
    expect(risicoVan(3, "crypto")).toBeGreaterThan(risicoVan(3, "goud"));
    expect(risicoVan(50, "memecoin")).toBe(100);
  });
});

describe("munten van CoinGecko", () => {
  it("leest veranderingen en herkent memecoins", () => {
    const a = analyseerCoin({ id: "dogecoin", symbol: "doge", name: "Dogecoin", current_price: 0.2, price_change_percentage_24h_in_currency: 3, price_change_percentage_7d_in_currency: 12, price_change_percentage_30d_in_currency: 20, high_24h: 0.21, low_24h: 0.19 }, soortCoin("dogecoin", 8));
    expect(a.soort).toBe("memecoin");
    expect(a.signaal).toBe("sterke-stijging");
    expect(a.naam).toBe("Dogecoin (DOGE)");
    expect(soortCoin("bitcoin", 1)).toBe("crypto");
    expect(soortCoin("onbekend", 400)).toBe("memecoin");
  });
});

describe("kansen en inzet", () => {
  it("kiest eerst duidelijke signalen met het laagste risico, en laat oververhit en onrustig weg", () => {
    const mk = (id: string, signaal: "sterke-stijging" | "oververhit" | "dip" | "neutraal", risico: number) => ({ id, naam: id, soort: "crypto" as const, laatste: 1, r1: 0, r7: 0, r30: 0, schommeling: 0, boven20: true, dalingVanTop: 0, signaal, risico, uitleg: "" });
    const k = kiesKansen([mk("a", "sterke-stijging", 60), mk("b", "sterke-stijging", 30), mk("c", "oververhit", 10), mk("d", "dip", 5), mk("e", "neutraal", 1)]);
    expect(k.map((x) => x.id)).toEqual(["b", "a", "d"]);
  });

  it("de inzet is een klein deel van het eigen speelgeld, kleiner bij meer risico, en nul zonder budget", () => {
    expect(voorstelBedragCents(10, 0)).toBe(0);
    expect(voorstelBedragCents(10, 100_000)).toBeGreaterThan(voorstelBedragCents(90, 100_000));
    expect(voorstelBedragCents(0, 100_000)).toBeLessThanOrEqual(20_000);
    expect(voorstelBedragCents(100, 100_000)).toBe(2_000);
  });

  it("noemt altijd dat het geen beleggingsadvies is", () => {
    expect(AFWIJZING).toContain("geen beleggingsadvies");
    expect(AFWIJZING).toContain("voert zelf geen handel uit");
  });
});
