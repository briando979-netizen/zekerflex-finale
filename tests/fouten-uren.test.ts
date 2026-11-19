import { describe, it, expect } from "vitest";
import { uurSleutel, samenvoegUren, snoeiUren, aantalLaatste24u } from "@/lib/ops/fouten-uren";

// Pure uurbakjes van het foutenlogboek (lib/ops/fouten-uren.ts). Vaste tijden,
// zones expliciet (UTC-Z en een +02:00), zodat de test geen tijdbom wordt.

const at = (iso: string) => new Date(iso);

describe("uurSleutel", () => {
  it("geeft het UTC-uur van een tijdstip", () => {
    expect(uurSleutel(at("2026-11-19T00:37:12.000Z"))).toBe("2026-11-19T00");
    expect(uurSleutel(at("2026-11-19T23:59:59.999Z"))).toBe("2026-11-19T23");
  });
  it("zet een tijd met zone eerst naar UTC om", () => {
    expect(uurSleutel(at("2026-11-19T09:05:00+02:00"))).toBe("2026-11-19T07");
  });
});

describe("samenvoegUren", () => {
  it("telt per uur op", () => {
    expect(samenvoegUren({ "2026-11-19T00": 2, "2026-11-19T01": 1 }, { "2026-11-19T01": 3, "2026-11-19T02": 5 })).toEqual({
      "2026-11-19T00": 2,
      "2026-11-19T01": 4,
      "2026-11-19T02": 5,
    });
  });
  it("werkt met een ontbrekende kant", () => {
    expect(samenvoegUren(undefined, { "2026-11-19T00": 1 })).toEqual({ "2026-11-19T00": 1 });
    expect(samenvoegUren({ "2026-11-19T00": 1 }, undefined)).toEqual({ "2026-11-19T00": 1 });
  });
});

describe("snoeiUren", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  it("houdt alleen de laatste 48 uur en gooit nullen weg", () => {
    const uren = {
      "2026-11-19T11": 3, // 1 u geleden
      "2026-11-18T13": 2, // 23 u geleden
      "2026-11-17T13": 1, // 47 u geleden -> blijft
      "2026-11-17T11": 9, // 49 u geleden -> weg
      "2026-11-19T10": 0, // nul -> weg
    };
    expect(snoeiUren(uren, now)).toEqual({ "2026-11-19T11": 3, "2026-11-18T13": 2, "2026-11-17T13": 1 });
  });
  it("negeert een onzinnige sleutel", () => {
    expect(snoeiUren({ rommel: 5, "2026-11-19T11": 1 }, now)).toEqual({ "2026-11-19T11": 1 });
  });
});

describe("aantalLaatste24u", () => {
  const now = Date.parse("2026-11-19T12:30:00Z");
  it("telt alleen de bakjes die binnen 24 uur beginnen", () => {
    const uren = {
      "2026-11-19T12": 4, // nu
      "2026-11-19T00": 2, // 12,5 u geleden
      "2026-11-18T13": 1, // 23,5 u geleden -> binnen
      "2026-11-18T11": 7, // 25,5 u geleden -> buiten
    };
    expect(aantalLaatste24u(uren, now)).toBe(7);
  });
  it("een groep zonder bakjes (van vóór dit veld) geeft 0", () => {
    expect(aantalLaatste24u(undefined, now)).toBe(0);
    expect(aantalLaatste24u({}, now)).toBe(0);
  });
});
