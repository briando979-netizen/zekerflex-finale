import { describe, expect, it } from "vitest";
import { leesRegels, type BestelRegel } from "@/lib/horeca/bestellen";
import { STAPPEN, type Fase, klaarOmTeServeren, stapVoorStatus, stationFase, statusUit, verplaats } from "@/lib/horeca/fasen";

const NU = "2026-11-04T18:30:00.000Z";
const regel = (naam: string, station: "keuken" | "bar", extra: Partial<BestelRegel> = {}): BestelRegel => ({ itemId: naam, naam, prijsCent: 500, aantal: 1, opmerking: "", station, ...extra });
const bestelling = () => [regel("Burger", "keuken"), regel("Friet", "keuken", { aantal: 2 }), regel("Cola", "bar")];
const stap = (r: BestelRegel[], filter: "keuken" | "bar" | "alles", s: keyof typeof STAPPEN, nu = NU) => {
  const x: { van: readonly Fase[]; naar: Fase; laatste?: boolean } = STAPPEN[s];
  return verplaats(r, filter, x.van, x.naar, nu, x.laatste === true);
};

describe("horeca-fasen", () => {
  it("een nieuwe bestelling is NIEUW", () => {
    expect(statusUit(bestelling())).toBe("NIEUW");
    expect(stationFase(bestelling(), "bar")).toBe("nieuw");
  });

  it("de bar is klaar terwijl de keuken nog bezig is", () => {
    let r = stap(bestelling(), "keuken", "start");
    r = stap(r, "bar", "klaar");
    expect(statusUit(r)).toBe("IN_BEREIDING");
    expect(stationFase(r, "bar")).toBe("klaar");
    expect(stationFase(r, "keuken")).toBe("gestart");
    expect(klaarOmTeServeren(r)).toBe(1);
    expect(r.find((x) => x.naam === "Cola")?.klaarOp).toBe(NU);
    expect(r.find((x) => x.naam === "Burger")?.klaarOp).toBeUndefined();
  });

  it("serveren brengt alleen weg wat klaar is, nooit wat nog in de maak is", () => {
    let r = stap(bestelling(), "bar", "klaar");
    r = stap(r, "alles", "serveer");
    expect(r.find((x) => x.naam === "Cola")?.fase).toBe("geserveerd");
    expect(r.find((x) => x.naam === "Burger")?.fase).toBeUndefined();
    expect(statusUit(r)).toBe("IN_BEREIDING");
    r = stap(r, "keuken", "klaar");
    // wat over is, staat klaar: de hele bestelling is KLAAR
    expect(statusUit(r)).toBe("KLAAR");
    expect(stationFase(r, "alles")).toBe("klaar");
    r = stap(r, "alles", "serveer");
    expect(statusUit(r)).toBe("GESERVEERD");
  });

  it("alles klaar is KLAAR, ook zonder eerst Start", () => {
    const r = stap(bestelling(), "alles", "klaar");
    expect(statusUit(r)).toBe("KLAAR");
  });

  it("een dubbele tik doet niets extra", () => {
    const een = stap(bestelling(), "keuken", "klaar");
    expect(stap(een, "keuken", "klaar")).toEqual(een);
    // Start na Klaar zet niets terug
    expect(stap(een, "keuken", "start")).toEqual(een);
  });

  it("Terug haalt een per ongeluk afgemelde bon terug en wist de klaartijd", () => {
    const klaar = stap(stap(bestelling(), "keuken", "start"), "keuken", "klaar");
    const terug = stap(klaar, "keuken", "terugNaarBezig");
    expect(stationFase(terug, "keuken")).toBe("gestart");
    expect(terug.every((x) => x.klaarOp === undefined)).toBe(true);
    expect(stationFase(stap(terug, "keuken", "terugNaarNieuw"), "keuken")).toBe("nieuw");
  });

  it("serveren terugdraaien zet alleen geserveerde regels terug op klaar, met de klaartijd", () => {
    const r = stap(stap(bestelling(), "bar", "klaar"), "alles", "serveer");
    expect(r.find((x) => x.naam === "Cola")?.geserveerdOp).toBe(NU);
    const terug = stap(r, "alles", "serveerTerug");
    expect(terug.find((x) => x.naam === "Cola")).toMatchObject({ fase: "klaar", klaarOp: NU });
    expect(terug.find((x) => x.naam === "Cola")?.geserveerdOp).toBeUndefined();
    expect(terug.find((x) => x.naam === "Burger")?.fase).toBeUndefined();
  });

  it("ongedaan maken laat eerder geserveerde drankjes staan", () => {
    const LATER = "2026-11-04T18:50:00.000Z";
    let r = stap(stap(bestelling(), "bar", "klaar"), "alles", "serveer");
    r = stap(stap(r, "keuken", "klaar", LATER), "alles", "serveer", LATER);
    const terug = stap(r, "alles", "serveerTerug", LATER);
    expect(terug.find((x) => x.naam === "Cola")?.fase).toBe("geserveerd");
    expect(terug.find((x) => x.naam === "Burger")?.fase).toBe("klaar");
    expect(terug.find((x) => x.naam === "Friet")?.fase).toBe("klaar");
  });

  it("een status uit het beheer zet de regels mee", () => {
    const s = stapVoorStatus("GESERVEERD");
    const r = verplaats(bestelling(), "alles", s.van, s.naar, NU);
    expect(statusUit(r)).toBe("GESERVEERD");
    const n = stapVoorStatus("NIEUW");
    expect(statusUit(verplaats(r, "alles", n.van, n.naar, NU))).toBe("NIEUW");
  });

  it("fase en klaartijd overleven de database (leesRegels)", () => {
    const r = stap(bestelling(), "bar", "klaar");
    expect(leesRegels(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(leesRegels([{ naam: "X", prijsCent: 1, aantal: 1, fase: "onzin" }])[0]?.fase).toBeUndefined();
  });

  it("een station zonder regels heeft geen fase", () => {
    expect(stationFase([regel("Burger", "keuken")], "bar")).toBeNull();
  });
});
