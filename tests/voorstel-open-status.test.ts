import { describe, expect, it } from "vitest";
import { openStatus, openingsRegels, type OpenTijden } from "@/lib/voorstel/open-status";
import { STANDAARD_OPEN } from "@/lib/voorstel/schwarzwald-agenda";

const STANDAARD: OpenTijden = { open: STANDAARD_OPEN, gesloten: [] };
const m = (u: number, min = 0) => u * 60 + min;

// 2026-11-04 is een woensdag (open 13:00–22:30), 2026-11-09 een maandag (dicht)
describe("openStatus", () => {
  it("is open binnen de tijden van vandaag", () => {
    expect(openStatus("2026-11-04", m(15), STANDAARD)).toEqual({ open: true, tekst: "Nu open tot 22:30" });
  });

  it("noemt de openingstijd van vandaag als het nog vroeg is", () => {
    expect(openStatus("2026-11-04", m(9, 30), STANDAARD)).toEqual({ open: false, tekst: "Vandaag open vanaf 13:00" });
  });

  it("verwijst na sluitingstijd naar morgen", () => {
    expect(openStatus("2026-11-04", m(22, 30), STANDAARD)).toEqual({ open: false, tekst: "Nu gesloten · morgen open vanaf 13:00" });
  });

  it("noemt de weekdag als de volgende opening verder weg ligt", () => {
    expect(openStatus("2026-11-09", m(12), STANDAARD).tekst).toBe("Nu gesloten · woensdag open vanaf 13:00");
  });

  it("houdt rekening met extra gesloten datums", () => {
    const t = { ...STANDAARD, gesloten: ["2026-11-04", "2026-11-05"] };
    expect(openStatus("2026-11-04", m(15), t)).toEqual({ open: false, tekst: "Nu gesloten · vrijdag open vanaf 13:00" });
  });

  it("noemt een datum als de volgende opening meer dan een week weg is", () => {
    const dicht = Array.from({ length: 10 }, (_, i) => `2026-11-${String(4 + i).padStart(2, "0")}`);
    expect(openStatus("2026-11-04", m(15), { ...STANDAARD, gesloten: dicht }).tekst).toBe("Nu gesloten · op 14 november open vanaf 11:00");
  });

  it("zegt tijdelijk gesloten als er twee weken niets open is", () => {
    const leeg: OpenTijden = { open: { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null }, gesloten: [] };
    expect(openStatus("2026-11-04", m(15), leeg)).toEqual({ open: false, tekst: "Tijdelijk gesloten" });
  });
});

describe("openingsRegels", () => {
  it("geeft de standaardtijden zoals op hun huidige site", () => {
    expect(openingsRegels(STANDAARD_OPEN)).toEqual([
      { dagen: "Woensdag t/m vrijdag", tijd: "13:00 – 22:30" },
      { dagen: "Zaterdag en zondag", tijd: "11:00 – 22:30" },
    ]);
  });

  it("volgt aangepaste tijden van de beheerder", () => {
    const open = { ...STANDAARD_OPEN, 5: { van: m(13), tot: m(23, 30) } };
    expect(openingsRegels(open)).toEqual([
      { dagen: "Woensdag en donderdag", tijd: "13:00 – 22:30" },
      { dagen: "Vrijdag", tijd: "13:00 – 23:30" },
      { dagen: "Zaterdag en zondag", tijd: "11:00 – 22:30" },
    ]);
  });

  it("voegt dagen met een dichte dag ertussen niet samen", () => {
    const open = { ...STANDAARD_OPEN, 4: null };
    expect(openingsRegels(open).map((r) => r.dagen)).toEqual(["Woensdag", "Vrijdag", "Zaterdag en zondag"]);
  });
});
