import { describe, expect, it } from "vitest";
import { dagstaatRij, type BonRegel, type KassaBetaling } from "@/lib/horeca/kassa";
import { journaalCsv, journaalRegels, leesGrootboek, STANDAARD_GROOTBOEK } from "@/lib/horeca/journaal";

// De kassa als journaalposten voor een boekhoudprogramma (18 nov 2026): per dag één boeking die sluit, met de
// grootboeknummers van de zaak.

const r = (prijsCent: number, aantal: number, btw: number): BonRegel => ({ naam: "x", prijsCent, aantal, btw });
const bon = (methode: string, regels: BonRegel[], fooiCent = 0): KassaBetaling => ({ methode, regels, fooiCent, bedragCent: regels.reduce((s, x) => s + x.prijsCent * x.aantal, 0) });

const dag: KassaBetaling[] = [
  bon("pin", [r(1950, 2, 9), r(450, 2, 21)], 200),
  bon("contant", [r(1250, 1, 9), r(-125, 1, 9)], 50),
  bon("kaart", [r(800, 1, 21)]),
  bon("ideal", [r(350, 1, 0)]),
];
const som = (l: { debetCent: number; creditCent: number }[], k: "debetCent" | "creditCent") => l.reduce((s, x) => s + x[k], 0);

describe("journaal voor het boekhoudprogramma", () => {
  it("sluit per dag: debet is gelijk aan credit", () => {
    const regels = journaalRegels(dagstaatRij({ datum: "2026-11-14", betalingen: dag, geteldCent: null }), STANDAARD_GROOTBOEK);
    expect(som(regels, "debetCent")).toBe(som(regels, "creditCent"));
    expect(som(regels, "debetCent")).toBeGreaterThan(0);
    // ontvangsten staan debet, omzet credit
    expect(regels.find((x) => x.rekening === "1220")?.debetCent).toBe(1950 * 2 + 450 * 2 + 200);
    expect(regels.find((x) => x.rekening === "8020")?.creditCent).toBe(350);
    expect(regels.find((x) => x.rekening === "1700")?.creditCent).toBe(250);
  });

  it("een dag met meer terug dan verkocht staat aan de andere kant, zonder min, en sluit ook", () => {
    const regels = journaalRegels(dagstaatRij({ datum: "2026-11-15", betalingen: [bon("contant", [r(-500, 1, 9)])], geteldCent: null }), STANDAARD_GROOTBOEK);
    expect(regels.every((x) => x.debetCent >= 0 && x.creditCent >= 0)).toBe(true);
    expect(regels.find((x) => x.rekening === "1000")?.creditCent).toBe(500);
    expect(som(regels, "debetCent")).toBe(som(regels, "creditCent"));
  });

  it("een dag zonder omzet geeft geen regels", () => {
    expect(journaalRegels(dagstaatRij({ datum: "2026-11-16", betalingen: [], geteldCent: null }), STANDAARD_GROOTBOEK)).toEqual([]);
  });

  it("neemt de eigen grootboeknummers over en vult de rest aan met het standaardnummer", () => {
    const g = leesGrootboek({ kas: "1001", omzet9: "8100.1", pin: "niet goed!", fooi: 12, constructor: "x" });
    expect(g.kas).toBe("1001");
    expect(g.omzet9).toBe("8100.1");
    expect(g.pin).toBe(STANDAARD_GROOTBOEK.pin);
    expect(g.fooi).toBe(STANDAARD_GROOTBOEK.fooi);
    expect(Object.keys(g).sort()).toEqual(Object.keys(STANDAARD_GROOTBOEK).sort());
    expect(leesGrootboek(null)).toEqual(STANDAARD_GROOTBOEK);
  });

  it("geeft een CSV met een kop, puntkomma's en Nederlandse bedragen", () => {
    const csv = journaalCsv([{ datum: "2026-11-14", betalingen: dag, geteldCent: null }, { datum: "2026-11-15", betalingen: [], geteldCent: null }], STANDAARD_GROOTBOEK);
    const rijen = csv.replace(/^﻿/, "").split("\r\n");
    expect(rijen[0]).toBe('"Datum";"Dagboek";"Grootboekrekening";"Omschrijving";"Debet";"Credit"');
    expect(rijen.some((x) => x.includes('"1220"') && x.includes('"50,00"'))).toBe(true);
    // de lege dag komt er niet in
    expect(rijen.some((x) => x.includes("2026-11-15"))).toBe(false);
  });
});
