import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  belbaar,
  bezorgkostenVoor,
  hoofdTarief,
  kmTekst,
  leesBezorgen,
  leverFase,
  leverFout,
  opVijf,
  postcodeNetjes,
  schuif,
  STANDAARD_BEZORGEN,
  teBetalenCent,
  tijdOpDag,
  tijdTekst,
  vroegsteOp,
} from "@/lib/horeca/bezorgen";
import { MODULES, zetModule } from "@/lib/horeca/modules";
import { horecaTabs } from "@/lib/horeca/tabs";

// Afhalen en bezorgen in de horeca (15 nov 2026): instellingen, kosten, straal,
// tijden in Nederlandse tijd en de fasen van een levering. Elke datum met een zone.

const lees = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("instellingen", () => {
  it("lege of rare invoer geeft de standaard, met grenzen", () => {
    expect(leesBezorgen(null)).toEqual(STANDAARD_BEZORGEN);
    const r = leesBezorgen({ straalKm: 99, minimumCent: -5, kostenCent: 1e9, afhaalMinuten: 1, bezorgMinuten: "x", gratisVanafCent: null, bezorgers: [{ id: "a", naam: " Sam " }, { naam: "zonder id" }, 7] });
    expect(r.straalKm).toBe(30);
    expect(r.minimumCent).toBe(0);
    expect(r.kostenCent).toBe(5000);
    expect(r.afhaalMinuten).toBe(5);
    expect(r.bezorgMinuten).toBe(STANDAARD_BEZORGEN.bezorgMinuten);
    expect(r.gratisVanafCent).toBeNull();
    expect(r.bezorgers).toEqual([{ id: "a", naam: "Sam", telefoon: "", actief: true }]);
  });

  it("bezorgkosten: alleen bij bezorgen, gratis vanaf het drempelbedrag", () => {
    const inst = { ...STANDAARD_BEZORGEN, kostenCent: 250, gratisVanafCent: 3000 };
    expect(bezorgkostenVoor("afhalen", 1000, inst)).toBe(0);
    expect(bezorgkostenVoor("tafel", 1000, inst)).toBe(0);
    expect(bezorgkostenVoor("bezorgen", 2999, inst)).toBe(250);
    expect(bezorgkostenVoor("bezorgen", 3000, inst)).toBe(0);
    expect(bezorgkostenVoor("bezorgen", 99_999, { ...inst, gratisVanafCent: null })).toBe(250);
  });

  it("leverFout: uit, minimum en straal; een onbekende afstand mag", () => {
    const inst = { ...STANDAARD_BEZORGEN, afhalen: true, bezorgen: true, minimumCent: 1500, straalKm: 5 };
    expect(leverFout("afhalen", inst, { subtotaalCent: 100, afstandM: null })).toBeNull();
    expect(leverFout("afhalen", { ...inst, afhalen: false }, { subtotaalCent: 100, afstandM: null })).toMatch(/Afhalen staat uit/);
    expect(leverFout("bezorgen", inst, { subtotaalCent: 1499, afstandM: 100 })).toMatch(/vanaf €\s15,00/);
    expect(leverFout("bezorgen", inst, { subtotaalCent: 2000, afstandM: 7200 })).toBe("We bezorgen tot 5,0 km; dit adres ligt op 7,2 km.");
    expect(leverFout("bezorgen", inst, { subtotaalCent: 2000, afstandM: 4999 })).toBeNull();
    expect(leverFout("bezorgen", inst, { subtotaalCent: 2000, afstandM: null })).toBeNull();
  });

  it("te betalen: gerechten min korting plus bezorgkosten, nooit onder nul", () => {
    expect(teBetalenCent({ totaalCent: 2700, kortingCent: 270, bezorgkostenCent: 100 })).toBe(2530);
    expect(teBetalenCent({ totaalCent: 100, kortingCent: 500, bezorgkostenCent: 250 })).toBe(250);
  });

  it("bezorgkosten volgen het tarief met de meeste omzet", () => {
    expect(hoofdTarief([])).toBe(9);
    expect(hoofdTarief([{ btw: 9, prijsCent: 1200, aantal: 2 }, { btw: 21, prijsCent: 500, aantal: 3 }])).toBe(9);
    expect(hoofdTarief([{ btw: 9, prijsCent: 300, aantal: 1 }, { btw: 21, prijsCent: 650, aantal: 2 }])).toBe(21);
  });
});

describe("tijden in Nederlandse tijd", () => {
  const nu = new Date("2026-11-15T17:52:00+01:00");

  it("vroegste tijd: nu plus de minuten, naar boven op 5 minuten", () => {
    const inst = { ...STANDAARD_BEZORGEN, afhaalMinuten: 20, bezorgMinuten: 45 };
    expect(tijdTekst(vroegsteOp(nu, "afhalen", inst))).toBe("18:15");
    expect(tijdTekst(vroegsteOp(nu, "bezorgen", inst))).toBe("18:40");
    expect(opVijf(new Date("2026-11-15T18:00:00+01:00")).toISOString()).toBe(new Date("2026-11-15T18:00:00+01:00").toISOString());
  });

  it("een tijd op de dag zelf; ruim voorbij = morgen; ook in de zomertijd", () => {
    expect(tijdOpDag(nu, "18:30")?.toISOString()).toBe(new Date("2026-11-15T18:30:00+01:00").toISOString());
    expect(tijdOpDag(new Date("2026-11-15T23:10:00+01:00"), "00:15")?.toISOString()).toBe(new Date("2026-11-16T00:15:00+01:00").toISOString());
    expect(tijdOpDag(new Date("2026-07-01T12:00:00+02:00"), "18:30")?.toISOString()).toBe(new Date("2026-07-01T18:30:00+02:00").toISOString());
    expect(tijdOpDag(nu, "25:00")).toBeNull();
    expect(tijdOpDag(nu, "18.30")).toBeNull();
  });

  it("verschuiven met − en +, en ZSM zonder tijd", () => {
    const op = new Date("2026-11-15T18:30:00+01:00");
    expect(tijdTekst(schuif(op, 5))).toBe("18:35");
    expect(tijdTekst(schuif(op, -5))).toBe("18:25");
    expect(tijdTekst(null)).toBe("ZSM");
  });
});

describe("fasen en weergave", () => {
  const basis = { soort: "bezorgen", status: "NIEUW", bevestigdOp: null, onderwegOp: null, afgeleverdOp: null };
  it("bevestigen → keuken → klaar → onderweg → afgeleverd; geannuleerd wint", () => {
    expect(leverFase(basis)).toBe("bevestigen");
    expect(leverFase({ ...basis, bevestigdOp: "2026-11-15T17:30:00.000Z" })).toBe("keuken");
    expect(leverFase({ ...basis, bevestigdOp: "x", status: "KLAAR" })).toBe("klaar");
    expect(leverFase({ ...basis, bevestigdOp: "x", status: "KLAAR", onderwegOp: "y" })).toBe("onderweg");
    expect(leverFase({ ...basis, bevestigdOp: "x", status: "GESERVEERD", onderwegOp: "y", afgeleverdOp: "z" })).toBe("afgeleverd");
    expect(leverFase({ ...basis, status: "GEANNULEERD", afgeleverdOp: "z" })).toBe("geannuleerd");
  });

  it("afstand, postcode en telefoonnummer", () => {
    expect(kmTekst(650)).toBe("650 m");
    expect(kmTekst(1800)).toBe("1,8 km");
    expect(postcodeNetjes("1056ab")).toBe("1056 AB");
    expect(postcodeNetjes(" 1056 AB ")).toBe("1056 AB");
    expect(postcodeNetjes("0123 AB")).toBeNull();
    expect(belbaar("06-12 34 56 78")).toBe("0612345678");
    expect(belbaar("+31 6 1234 5678")).toBe("+31612345678");
    expect(belbaar("123")).toBeNull();
  });
});

describe("module, tabblad en opslag", () => {
  it("afhalen en bezorgen hoort bij bestellen, zonder eigen prijs", () => {
    expect(zetModule([], "bezorgen", true)).toEqual(["bestellen", "bezorgen"]);
    expect(zetModule(["bestellen", "bezorgen"], "bestellen", false)).toEqual([]);
    expect(MODULES.bezorgen.prijsCentPerMaand).toBe(0);
    expect(horecaTabs(["bestellen", "bezorgen"]).some((t) => t.id === "bezorgen")).toBe(true);
    expect(horecaTabs(["bestellen"]).some((t) => t.id === "bezorgen")).toBe(false);
  });

  it("het menu heeft een icoon voor het tabblad", () => {
    expect(lees("app/werkgever/layout.tsx")).toMatch(/bezorgen: <IPin \/>/);
  });

  it("na 12 maanden verdwijnen adres, postcode, plek, telefoon en e-mail van bestellingen", () => {
    const sweep = lees("lib/privacy/sweep.ts");
    expect(sweep).toMatch(/telefoon: "", email: "", adres: "", postcode: "", lat: null, lng: null/);
  });

  it("de migratie voegt alleen toe", () => {
    const sql = lees("prisma/migrations/20261115200000_horeca_bezorgen/migration.sql");
    expect(sql).not.toMatch(/DROP|DELETE|UPDATE|ALTER COLUMN|RENAME/i);
    expect(sql).toMatch(/ADD COLUMN\s+"soort" TEXT NOT NULL DEFAULT 'tafel'/);
  });
});
