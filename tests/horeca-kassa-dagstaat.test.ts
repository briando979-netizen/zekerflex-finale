import { describe, expect, it } from "vitest";
import { dagstaatCsv, dagstaatRij, ontvangstVan, rondtAf, type BonRegel, type KassaBetaling } from "@/lib/horeca/kassa";

// De dagstaat voor de boekhouder (15 nov 2026): per dag omzet en btw per tarief, fooi, ontvangsten per betaalwijze
// en het kasverschil, zo dat hij per dag sluit (memoriaalboeking). Plus de rekening: de bezorgkosten horen op de betaling
// die de bestelling afrondt. (De kassa en het horecabeheer zelf zijn op 22 nov 2026 weggehaald.)

const r = (prijsCent: number, aantal: number, btw: number): BonRegel => ({ naam: "x", prijsCent, aantal, btw });
const bon = (methode: string, regels: BonRegel[], fooiCent = 0): KassaBetaling => ({ methode, regels, fooiCent, bedragCent: regels.reduce((s, x) => s + x.prijsCent * x.aantal, 0) });

const dag: KassaBetaling[] = [
  bon("pin", [r(1950, 2, 9), r(450, 2, 21)], 200),
  bon("contant", [r(1250, 1, 9), r(-125, 1, 9)], 50),
  bon("kaart", [r(800, 1, 21)]),
  bon("ideal", [r(350, 1, 0)]),
];

describe("dagstaat", () => {
  it("online aan tafel (pas, Apple Pay, Google Pay) staat samen, onbekend is overig", () => {
    expect(ontvangstVan("pin")).toBe("pin");
    expect(ontvangstVan("kaart")).toBe("online");
    expect(ontvangstVan("apple_pay")).toBe("online");
    expect(ontvangstVan("constructor")).toBe("overig");
  });

  it("sluit per dag: omzet exclusief + btw + fooi = wat er binnenkwam", () => {
    const rij = dagstaatRij({ datum: "2026-11-14", betalingen: dag, geteldCent: null });
    expect(rij.bonnen).toBe(4);
    expect(rij.omzetCent).toBe(3900 + 900 + 1125 + 800 + 350);
    const credit = rij.btw[21].exclCent + rij.btw[21].btwCent + rij.btw[9].exclCent + rij.btw[9].btwCent + rij.btw[0].exclCent + rij.fooiCent;
    const debet = Object.values(rij.ontvangen).reduce((s, x) => s + x, 0);
    expect(credit).toBe(debet);
    expect(debet).toBe(rij.omzetCent + rij.fooiCent);
    expect(rij.ontvangen).toEqual({ pin: 4800 + 200, contant: 1125 + 50, ideal: 350, online: 800, overig: 0 });
    // btw over het dagtotaal per tarief: 9% over 5025, 21% over 1700
    expect(rij.btw[9]).toEqual({ exclCent: 5025 - 415, btwCent: 415 });
    expect(rij.btw[21]).toEqual({ exclCent: 1700 - 295, btwCent: 295 });
    expect(rij.btw[0]).toEqual({ exclCent: 350, btwCent: 0 });
    expect(rij.kasVerschilCent).toBeNull();
  });

  it("kasverschil: geteld min contant plus fooi contant", () => {
    expect(dagstaatRij({ datum: "2026-11-14", betalingen: dag, geteldCent: 1200 }).kasVerschilCent).toBe(1200 - 1175);
    expect(dagstaatRij({ datum: "2026-11-14", betalingen: [], geteldCent: 0 }).kasVerschilCent).toBe(0);
  });

  it("csv: kop, een regel per dag (ook een lege), een totaalregel; Nederlandse bedragen", () => {
    const csv = dagstaatCsv([
      { datum: "2026-11-14", betalingen: dag, geteldCent: 1200 },
      { datum: "2026-11-15", betalingen: [], geteldCent: null },
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    const rijen = csv.slice(1).split("\r\n").map((x) => x.split(";").map((v) => v.replace(/^"|"$/g, "")));
    expect(rijen).toHaveLength(4);
    const [kop, eerste, tweede, totaal] = rijen;
    expect(kop?.[0]).toBe("Datum");
    expect(kop).toContain("Btw 21%");
    expect(kop).toContain("Totaal ontvangen");
    expect(kop?.length).toBe(eerste?.length);
    expect(eerste?.[0]).toBe("2026-11-14");
    expect(eerste?.[kop?.indexOf("Omzet incl. btw") ?? -1]).toBe("70,75");
    expect(eerste?.[kop?.indexOf("Kasverschil") ?? -1]).toBe("0,25");
    expect(tweede?.[kop?.indexOf("Kas geteld") ?? -1]).toBe("");
    expect(totaal?.[0]).toBe("Totaal");
    expect(totaal?.[kop?.indexOf("Totaal ontvangen") ?? -1]).toBe("73,25");
    expect(totaal?.[kop?.indexOf("Kasverschil") ?? -1]).toBe("0,25");
  });

});

describe("rekening", () => {
  it("per gerecht afrekenen: de bezorgkosten horen op de betaling die de bestelling afrondt", () => {
    const rekening = [
      { bestellingId: "b1", index: 0, nummer: 7, naam: "Pizza", prijsCent: 1200, aantal: 2, btw: 9 as const },
      { bestellingId: "b1", index: 2, nummer: 7, naam: "Cola", prijsCent: 300, aantal: 1, btw: 9 as const },
    ];
    // een deel: nog niet
    expect(rondtAf(rekening, [{ bestellingId: "b1", index: 0, aantal: 2 }], "b1")).toBe(false);
    expect(rondtAf(rekening, [{ bestellingId: "b1", index: 0, aantal: 1 }, { bestellingId: "b1", index: 2, aantal: 1 }], "b1")).toBe(false);
    // alles wat nog open staat: ja
    expect(rondtAf(rekening, [{ bestellingId: "b1", index: 0, aantal: 2 }, { bestellingId: "b1", index: 2, aantal: 1 }], "b1")).toBe(true);
    // een andere bestelling of een lege rekening: nee
    expect(rondtAf(rekening, [{ bestellingId: "b2", index: 0, aantal: 2 }, { bestellingId: "b2", index: 2, aantal: 1 }], "b1")).toBe(false);
    expect(rondtAf([], [], "b1")).toBe(false);
  });
});
