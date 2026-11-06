import { describe, expect, it } from "vitest";
import { BLUETOOTH_PRINT, KOLOMMEN, inBrokken, labelNaarEscPos, naarBytes } from "@/lib/locatie/escpos";
import type { LabelInhoud } from "@/lib/locatie/modules";

// ESC/POS voor bon- en labelprinters (lib/locatie/escpos.ts).

const badge: LabelInhoud = { soort: "badge", kop: "Sanne de Vries", regels: ["Bardienst", "Café Zeker · Utrecht"], tijd: "5 nov 2026, 09:05", voet: "Melden bij de receptie", qr: "ZF-INCHECK:abc" };

describe("tekst naar printerbytes", () => {
  it("accenten en het euroteken gaan mee, onbekende tekens worden een vraagteken", () => {
    expect(naarBytes("Café")).toEqual([0x43, 0x61, 0x66, 0xe9]);
    expect(naarBytes("€")).toEqual([0x80]);
    expect(naarBytes("…")).toEqual([0x2e, 0x2e, 0x2e]);
    expect(naarBytes("日")).toEqual([0x3f]);
  });
});

describe("één label", () => {
  it("begint met een reset en eindigt met afsnijden", () => {
    const b = labelNaarEscPos(badge);
    expect(Array.from(b.slice(0, 2))).toEqual([0x1b, 0x40]);
    expect(Array.from(b.slice(-4))).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it("bevat de naam, de regels en de QR-opdracht", () => {
    const b = labelNaarEscPos(badge);
    const s = Buffer.from(b).toString("latin1");
    expect(s).toContain("Sanne de Vries");
    expect(s).toContain("Bardienst");
    expect(s).toContain("Melden bij de receptie");
    // GS ( k … 0x31 0x50 0x30 = QR-gegevens opslaan
    expect(s).toContain("\x1d(k");
    expect(s).toContain("ZF-INCHECK:abc");
  });

  it("zonder QR en zonder snijden geen QR- of snijcommando", () => {
    const b = labelNaarEscPos({ soort: "naamsticker", kop: "Jan", regels: ["Bezoeker"] }, { rol: 80, snijden: false });
    const s = Buffer.from(b).toString("latin1");
    expect(s).not.toContain("\x1d(k");
    expect(Array.from(b.slice(-4))).not.toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it("een lange naam wordt afgebroken op de helft van de kolommen (dubbele breedte)", () => {
    const lang = "Een Heel Erg Lange Naam Die Nooit Past Op Een Rol";
    const s = Buffer.from(labelNaarEscPos({ soort: "badge", kop: lang, regels: [] })).toString("latin1");
    expect(s).not.toContain(lang);
    expect(s).toContain(lang.slice(0, KOLOMMEN[58] / 2 - 2));
  });

  it("een incheckbon krijgt de kop 'Ingecheckt' en de tijd bovenaan", () => {
    const s = Buffer.from(labelNaarEscPos({ soort: "incheckbon", kop: "Sanne", regels: [], tijd: "09:05" })).toString("latin1");
    expect(s.indexOf("Ingecheckt")).toBeGreaterThan(-1);
    expect(s.indexOf("Ingecheckt")).toBeLessThan(s.indexOf("Sanne"));
  });
});

describe("Bluetooth", () => {
  it("brokken van 100 bytes, de laatste korter", () => {
    const bytes = new Uint8Array(250).fill(1);
    const brokken = inBrokken(bytes);
    expect(brokken.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(BLUETOOTH_PRINT.diensten.length).toBe(BLUETOOTH_PRINT.schrijfKenmerken.length);
  });
});
