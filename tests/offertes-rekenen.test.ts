import { describe, expect, it } from "vitest";
import { aantalTekst, aantalUitTekst, berekenTotalen, centUitTekst, euro, maalDeelAf, procentTekst, regelBedragCent } from "@/lib/offertes/rekenen";

const regel = (aantal: number, prijsCent: number, btw = 21) => ({ aantal, prijsCent, btw });

describe("regelbedrag: aantal × prijs, één keer afgerond op hele centen (halven omhoog)", () => {
  it("rekent gewone bedragen exact", () => {
    expect(regelBedragCent(regel(1, 10_000))).toBe(10_000);
    expect(regelBedragCent(regel(8, 6_500))).toBe(52_000);
    expect(regelBedragCent(regel(2.5, 1_000))).toBe(2_500);
  });

  it("0,333 × 3 en andere aantallen met decimalen", () => {
    expect(regelBedragCent(regel(0.333, 300))).toBe(100); // 99,9 → 100
    expect(regelBedragCent(regel(3, 333))).toBe(999);
    expect(regelBedragCent(regel(0.333, 3))).toBe(1); // 0,999 → 1
    expect(regelBedragCent(regel(0.001, 499))).toBe(0); // 0,499 → 0
    expect(regelBedragCent(regel(0.001, 500))).toBe(1); // 0,5 → 1 (half-up)
    expect(regelBedragCent(regel(0.5, 1))).toBe(1);
    expect(regelBedragCent(regel(0.5, 3))).toBe(2); // 1,5 → 2
    expect(regelBedragCent(regel(1.005, 100))).toBe(101); // 100,5 → 101, niet de float-fout van 1.005 × 100
  });

  it("een aantal van nul of een prijs van nul geeft nul", () => {
    expect(regelBedragCent(regel(0, 5_000))).toBe(0);
    expect(regelBedragCent(regel(4, 0))).toBe(0);
  });

  it("grote aantallen blijven exact (BigInt in de tussenstap)", () => {
    expect(regelBedragCent(regel(1_000_000, 100_000_000))).toBe(100_000_000_000_000);
    expect(regelBedragCent(regel(999_999.999, 99_999_999))).toBe(maalDeelAf(999_999_999, 99_999_999, 1000));
    expect(maalDeelAf(7, 1, 2)).toBe(4);
    expect(maalDeelAf(5, 1, 2)).toBe(3);
    expect(maalDeelAf(0, 12345, 7)).toBe(0);
  });
});

describe("totalen: per tarief, korting verdeeld, btw per tarief afgerond", () => {
  it("één regel: 1 × € 100 met 21% btw", () => {
    const t = berekenTotalen([regel(1, 10_000)]);
    expect(t).toMatchObject({ subtotaalCent: 10_000, kortingCent: 0, nettoCent: 10_000, btwCent: 2_100, totaalCent: 12_100 });
    expect(t.tarieven).toEqual([{ btw: 21, subtotaalCent: 10_000, kortingCent: 0, nettoCent: 10_000, btwCent: 2_100 }]);
  });

  it("zonder regels is alles nul en er is geen tarief", () => {
    const t = berekenTotalen([]);
    expect(t).toEqual({ regelCent: [], tarieven: [], subtotaalCent: 0, kortingCent: 0, nettoCent: 0, btwCent: 0, totaalCent: 0 });
  });

  it("de btw wordt per tarief afgerond, niet per regel: 3 × 50 cent op 9% = 14 (niet 15)", () => {
    const t = berekenTotalen([regel(1, 50, 9), regel(1, 50, 9), regel(1, 50, 9)]);
    expect(t.tarieven).toEqual([{ btw: 9, subtotaalCent: 150, kortingCent: 0, nettoCent: 150, btwCent: 14 }]); // 13,5 → 14
    expect(t.totaalCent).toBe(164);
  });

  it("gemengde tarieven, oplopend, het totaal is de som van de delen", () => {
    const t = berekenTotalen([regel(1, 1_000, 21), regel(1, 1_000, 9), regel(1, 1_000, 0)]);
    expect(t.tarieven.map((x) => x.btw)).toEqual([0, 9, 21]);
    expect(t.tarieven.map((x) => x.btwCent)).toEqual([0, 90, 210]);
    expect(t).toMatchObject({ subtotaalCent: 3_000, btwCent: 300, totaalCent: 3_300 });
  });

  it("korting 10% over het geheel: per tarief afgerond, daarna btw over het netto bedrag", () => {
    const t = berekenTotalen([regel(8, 6_500)], 1_000);
    expect(t).toMatchObject({ subtotaalCent: 52_000, kortingCent: 5_200, nettoCent: 46_800, btwCent: 9_828, totaalCent: 56_628 });
    const k = berekenTotalen([regel(1, 50, 9), regel(1, 50, 9), regel(1, 50, 9)], 1_000);
    expect(k).toMatchObject({ subtotaalCent: 150, kortingCent: 15, nettoCent: 135, btwCent: 12, totaalCent: 147 }); // 12,15 → 12
  });

  it("de korting wordt per tarief afgerond (halven omhoog); de totale korting is de som", () => {
    const t = berekenTotalen([regel(1, 1_005, 21), regel(1, 1_005, 9)], 5_000);
    expect(t.tarieven).toEqual([
      { btw: 9, subtotaalCent: 1_005, kortingCent: 503, nettoCent: 502, btwCent: 45 },
      { btw: 21, subtotaalCent: 1_005, kortingCent: 503, nettoCent: 502, btwCent: 105 },
    ]);
    expect(t).toMatchObject({ subtotaalCent: 2_010, kortingCent: 1_006, nettoCent: 1_004, btwCent: 150, totaalCent: 1_154 });
  });

  it("korting 100%: alles nul, ook de btw", () => {
    const t = berekenTotalen([regel(3, 4_321, 21), regel(1, 999, 9)], 10_000);
    expect(t).toMatchObject({ kortingCent: t.subtotaalCent, nettoCent: 0, btwCent: 0, totaalCent: 0 });
    expect(t.subtotaalCent).toBe(13_962);
  });

  it("korting buiten 0-100% wordt begrensd, korting 0 verandert niets", () => {
    expect(berekenTotalen([regel(1, 1_000)], 20_000).totaalCent).toBe(0);
    expect(berekenTotalen([regel(1, 1_000)], -5).totaalCent).toBe(1_210);
    expect(berekenTotalen([regel(1, 1_000)], 0)).toEqual(berekenTotalen([regel(1, 1_000)]));
  });

  it("regelbedragen staan in de volgorde van de invoer", () => {
    expect(berekenTotalen([regel(2, 100), regel(0.5, 100), regel(1, 7)]).regelCent).toEqual([200, 50, 7]);
  });

  it("invariant: totaal = som van delen, netto = subtotaal - korting, voor veel willekeurige invoer", () => {
    let zaad = 12345;
    const volgende = (max: number) => {
      zaad = (zaad * 1103515245 + 12345) % 2147483648;
      return zaad % max;
    };
    for (let ronde = 0; ronde < 300; ronde++) {
      const n = 1 + volgende(12);
      const regels = Array.from({ length: n }, () => regel(volgende(20_000) / 1000, volgende(2_000_000), [0, 9, 21][volgende(3)] ?? 21));
      const t = berekenTotalen(regels, volgende(10_001));
      expect(t.nettoCent).toBe(t.subtotaalCent - t.kortingCent);
      expect(t.btwCent).toBe(t.tarieven.reduce((s, x) => s + x.btwCent, 0));
      expect(t.totaalCent).toBe(t.nettoCent + t.btwCent);
      expect(t.subtotaalCent).toBe(t.regelCent.reduce((s, c) => s + c, 0));
      for (const x of t.tarieven) {
        expect(Number.isInteger(x.btwCent)).toBe(true);
        expect(x.nettoCent).toBe(x.subtotaalCent - x.kortingCent);
        expect(x.btwCent).toBe(Math.round((x.nettoCent * x.btw) / 100 + 1e-9));
      }
    }
  });
});

describe("bedragen en aantallen in tekst", () => {
  it("euro", () => {
    expect(euro(123_456)).toBe("€ 1.234,56");
    expect(euro(5)).toBe("€ 0,05");
    expect(euro(0)).toBe("€ 0,00");
    expect(euro(100_000_000_000_000)).toBe("€ 1.000.000.000.000,00");
    expect(euro(-250)).toBe("-€ 2,50");
  });

  it("centUitTekst leest Nederlandse invoer en weigert onzin", () => {
    expect(centUitTekst("12,50")).toBe(1_250);
    expect(centUitTekst("12.5")).toBe(1_250);
    expect(centUitTekst("12,5")).toBe(1_250);
    expect(centUitTekst("1.250,00")).toBe(125_000);
    expect(centUitTekst("1.250")).toBe(125_000);
    expect(centUitTekst("1.25")).toBe(125);
    expect(centUitTekst("€ 12")).toBe(1_200);
    expect(centUitTekst("0,1")).toBe(10);
    expect(centUitTekst("0")).toBe(0);
    expect(centUitTekst("12,505")).toBeNull();
    expect(centUitTekst("-5")).toBeNull();
    expect(centUitTekst("abc")).toBeNull();
    expect(centUitTekst("")).toBeNull();
    expect(centUitTekst("1e3")).toBeNull();
  });

  it("aantalUitTekst: hoogstens 3 decimalen", () => {
    expect(aantalUitTekst("2,5")).toBe(2.5);
    expect(aantalUitTekst("0.333")).toBe(0.333);
    expect(aantalUitTekst(" 4 ")).toBe(4);
    expect(aantalUitTekst("0,3333")).toBeNull();
    expect(aantalUitTekst("-1")).toBeNull();
    expect(aantalUitTekst("")).toBeNull();
    expect(aantalUitTekst("1e3")).toBeNull();
  });

  it("aantalTekst en procentTekst", () => {
    expect(aantalTekst(2.5)).toBe("2,5");
    expect(aantalTekst(8)).toBe("8");
    expect(procentTekst(1_250)).toBe("12,5");
    expect(procentTekst(1_000)).toBe("10");
    expect(procentTekst(5)).toBe("0,05");
  });
});
