import { describe, expect, it } from "vitest";
import {
  MODULES,
  MODULE_LIJST,
  biedtAan,
  binnenDienstMarge,
  geldigKenteken,
  kanaalId,
  kluisZichtbaar,
  knipRegel,
  leesKanaalId,
  moduleAan,
  normaliseerKenteken,
  toegangsBesluit,
  toonKenteken,
  type LocatieStand,
  type Registratie,
} from "@/lib/locatie/modules";

// De Op locatie-modules (lib/locatie/modules.ts): definities, kentekens, het
// toegangsbesluit, het kluisvenster en de kanaal-id's van de portofoon.

describe("de vier modules", () => {
  it("elk in gewoon Nederlands, met wat de klant nodig heeft en 'op aanvraag' als prijs", () => {
    expect(MODULES).toEqual(["portofoon", "toegang", "kluis", "printen"]);
    for (const def of MODULE_LIJST) {
      expect(def.naam.length).toBeGreaterThan(5);
      expect(def.punten.length).toBeGreaterThanOrEqual(4);
      expect(def.nodig.length).toBeGreaterThan(10);
      expect(def.techniek.length).toBeGreaterThan(10);
      expect(def.prijsTekst).toBe("Op aanvraag");
      // geen Engels op het scherm
      expect(def.kort).not.toMatch(/\b(the|and|with|your)\b/);
    }
  });

  it("moduleAan leest de stand", () => {
    const stand: LocatieStand = { tenantId: "t1", modules: { kluis: { aan: true, sinds: "2026-11-05T08:00:00Z", door: "u1", doorNaam: "Jan" } }, bijgewerkt: "" };
    expect(moduleAan(stand, "kluis")).toBe(true);
    expect(moduleAan(stand, "printen")).toBe(false);
    expect(moduleAan(null, "kluis")).toBe(false);
  });
});

describe("kentekens", () => {
  it("normaliseert naar hoofdletters zonder streepjes of spaties", () => {
    expect(normaliseerKenteken("ab-123-c")).toBe("AB123C");
    expect(normaliseerKenteken(" g 001 bb ")).toBe("G001BB");
    expect(normaliseerKenteken("")).toBe("");
  });

  it("keurt alleen een mix van letters en cijfers van 4 tot 10 tekens goed", () => {
    expect(geldigKenteken("AB-123-C")).toBe(true);
    expect(geldigKenteken("1-KBB-23")).toBe(true);
    expect(geldigKenteken("ABCDEF")).toBe(false); // alleen letters
    expect(geldigKenteken("123456")).toBe(false); // alleen cijfers
    expect(geldigKenteken("A1")).toBe(false);
  });

  it("zet de Nederlandse streepjes terug op de wisselingen letter/cijfer", () => {
    expect(toonKenteken("AB123C")).toBe("AB-123-C");
    expect(toonKenteken("12ABC3")).toBe("12-ABC-3");
    expect(toonKenteken("G001BB")).toBe("G-001-BB");
    expect(toonKenteken("1KBB23")).toBe("1-KBB-23");
    expect(toonKenteken("XX99XX")).toBe("XX-99-XX");
    expect(toonKenteken("AB1234")).toBe("AB-12-34");
    expect(toonKenteken("1234AB")).toBe("12-34-AB");
    // buitenlands of afwijkend: zoals het is
    expect(toonKenteken("WOB-AB-1234")).toBe("WOBAB1234");
  });
});

describe("het toegangsbesluit", () => {
  const nu = new Date("2026-11-05T09:00:00Z");
  const werker: Registratie = { kenteken: "AB123CD", soort: "werker", naam: "Sanne", userId: "u1", door: "u1", sinds: "" };

  it("een onbekend kenteken gaat niet open", () => {
    expect(toegangsBesluit(null, "b1", null, nu)).toEqual({ open: false, reden: "onbekend" });
  });

  it("een flexwerker alleen als het rooster hem nu hier zet", () => {
    expect(toegangsBesluit(werker, "b1", { ingepland: true, shiftId: "s1" }, nu)).toMatchObject({ open: true, reden: "ingepland", naam: "Sanne", userId: "u1" });
    expect(toegangsBesluit(werker, "b1", { ingepland: false }, nu)).toMatchObject({ open: false, reden: "niet-ingepland", naam: "Sanne" });
    expect(toegangsBesluit(werker, "b1", null, nu).open).toBe(false);
  });

  it("een eigen medewerker altijd, maar alleen op zijn eigen vestiging als die is gezet", () => {
    const m: Registratie = { ...werker, soort: "medewerker", branchId: "b1" };
    expect(toegangsBesluit(m, "b1", null, nu)).toMatchObject({ open: true, reden: "medewerker" });
    expect(toegangsBesluit(m, "b2", null, nu)).toMatchObject({ open: false, reden: "andere-vestiging" });
  });

  it("een bezoeker alleen binnen het tijdvenster", () => {
    const b: Registratie = { kenteken: "XX99XX", soort: "bezoeker", naam: "Bakkerij Smit", geldigVan: "2026-11-05T08:00:00Z", geldigTot: "2026-11-05T10:00:00Z", door: "u2", sinds: "" };
    expect(toegangsBesluit(b, "b1", null, nu)).toMatchObject({ open: true, reden: "bezoeker" });
    expect(toegangsBesluit(b, "b1", null, new Date("2026-11-05T11:00:00Z"))).toMatchObject({ open: false, reden: "buiten-venster" });
    // zonder venster: altijd
    const { geldigVan: _v, geldigTot: _t, ...zonderVenster } = b;
    void _v;
    void _t;
    expect(toegangsBesluit(zonderVenster, "b1", null, nu).open).toBe(true);
  });

  it("de marge rond een dienst is 90 minuten vooraf en 60 minuten na", () => {
    const start = "2026-11-05T09:00:00Z";
    const eind = "2026-11-05T17:00:00Z";
    expect(binnenDienstMarge(start, eind, new Date("2026-11-05T07:31:00Z"))).toBe(true);
    expect(binnenDienstMarge(start, eind, new Date("2026-11-05T07:29:00Z"))).toBe(false);
    expect(binnenDienstMarge(start, eind, new Date("2026-11-05T17:59:00Z"))).toBe(true);
    expect(binnenDienstMarge(start, eind, new Date("2026-11-05T18:01:00Z"))).toBe(false);
  });
});

describe("de sleutelkluis", () => {
  const dienst = { branchId: "b1", startsAt: "2026-11-05T09:00:00Z", endsAt: "2026-11-05T17:00:00Z" };
  it("zichtbaar van `minutenVooraf` vóór de dienst tot het einde, alleen op de juiste vestiging", () => {
    const item = { minutenVooraf: 120 };
    expect(kluisZichtbaar(item, dienst, new Date("2026-11-05T06:59:00Z"))).toBe(false);
    expect(kluisZichtbaar(item, dienst, new Date("2026-11-05T07:00:00Z"))).toBe(true);
    expect(kluisZichtbaar(item, dienst, new Date("2026-11-05T17:00:00Z"))).toBe(true);
    expect(kluisZichtbaar(item, dienst, new Date("2026-11-05T17:01:00Z"))).toBe(false);
    expect(kluisZichtbaar({ ...item, branchId: "b2" }, dienst, new Date("2026-11-05T10:00:00Z"))).toBe(false);
    expect(kluisZichtbaar({ ...item, branchId: "b1" }, dienst, new Date("2026-11-05T10:00:00Z"))).toBe(true);
  });
});

describe("labels en portofoon", () => {
  it("knipt een regel af op het aantal tekens van de rol", () => {
    expect(knipRegel("Sanne de Vries", 32)).toBe("Sanne de Vries");
    expect(knipRegel("Een heel lange naam die niet past", 12)).toBe("Een heel la…");
    expect(knipRegel("  x  ", 5)).toBe("x");
  });

  it("kanaal-id's zijn klus:<id> of vestiging:<id>, niets anders", () => {
    expect(leesKanaalId(kanaalId("klus", "cmvs1234abcd"))).toEqual({ soort: "klus", id: "cmvs1234abcd" });
    expect(leesKanaalId("vestiging:br_001")).toEqual({ soort: "vestiging", id: "br_001" });
    expect(leesKanaalId("klus:../etc")).toBeNull();
    expect(leesKanaalId("gebouw:abcdefg")).toBeNull();
  });

  it("precies één van twee telefoons doet het aanbod", () => {
    expect(biedtAan("a", "b")).toBe(true);
    expect(biedtAan("b", "a")).toBe(false);
    expect(biedtAan("a", "b") !== biedtAan("b", "a")).toBe(true);
  });
});
