import { describe, expect, it } from "vitest";
import { legePlanning } from "@/lib/horeca-personeel/planning";
import { planningVoorMedewerker } from "@/lib/horeca-personeel/planning-view";
import { leegPersoneel, type PersoneelData } from "@/lib/horeca-personeel/model";

// Wat een medewerker van de planning ziet: zijn eigen regels, de open diensten en aanbiedingen van collega's, nooit de
// niet-beschikbaar, het verlof of de uren van een collega.

const personeel: PersoneelData = {
  ...leegPersoneel(),
  medewerkers: [
    { id: "m1", naam: "Piet Jansen", email: "p@x.test", functie: "", dashboardId: "d1", status: "actief", userId: "u1", uitgenodigd: "" },
    { id: "m2", naam: "Els de Vries", email: "e@x.test", functie: "", dashboardId: "d1", status: "actief", userId: "u2", uitgenodigd: "" },
  ],
};

function planning() {
  const p = legePlanning();
  p.diensten.push(
    { id: "a", medewerkerId: "m1", datum: "2026-11-17", van: "09:00", tot: "13:00", notitie: "" },
    { id: "b", medewerkerId: "m2", datum: "2026-11-17", van: "09:00", tot: "13:00", notitie: "" },
    { id: "c", medewerkerId: null, datum: "2026-11-18", van: "18:00", tot: "23:00", notitie: "" },
    { id: "d", medewerkerId: "m2", datum: "2026-11-19", van: "18:00", tot: "23:00", notitie: "" },
    { id: "e", medewerkerId: "m2", datum: "2026-11-20", van: "18:00", tot: "23:00", notitie: "" },
  );
  p.nietBeschikbaar.push({ id: "n1", medewerkerId: "m1", datum: "2026-11-21", notitie: "" }, { id: "n2", medewerkerId: "m2", datum: "2026-11-22", notitie: "geheim" });
  p.verlof.push({ id: "v1", medewerkerId: "m2", van: "2026-12-01", tot: "2026-12-05", reden: "geheim", status: "aangevraagd", op: "" });
  p.uren.push({ id: "u1", medewerkerId: "m1", datum: "2026-11-16", in: "09:00", uit: null, bron: "klok" }, { id: "u2", medewerkerId: "m2", datum: "2026-11-16", in: "10:00", uit: "12:00", bron: "klok" });
  p.ruilen.push(
    { id: "r1", dienstId: "d", van: "m2", naar: null, status: "aangeboden", op: "" }, // aan het team
    { id: "r2", dienstId: "e", van: "m2", naar: "m1", status: "aangeboden", op: "" }, // aan Piet
    { id: "r3", dienstId: "b", van: "m2", naar: "m3", status: "aangeboden", op: "" }, // aan een ander
    { id: "r4", dienstId: "a", van: "m1", naar: null, status: "aangeboden", op: "" }, // van Piet zelf
  );
  return p;
}

describe("planningVoorMedewerker", () => {
  const v = planningVoorMedewerker(planning(), personeel, "m1", "2026-11-16");

  it("alleen de eigen diensten, plus de open diensten", () => {
    expect(v.diensten.map((x) => x.id)).toEqual(["a"]);
    expect(v.open.map((x) => x.id)).toEqual(["c"]);
  });

  it("aanbiedingen: aan het team of aan mij, niet die van mezelf en niet die voor een ander, met de voornaam van wie aanbiedt", () => {
    expect(v.aanbiedingen.map((x) => x.ruil.id).sort()).toEqual(["r1", "r2"]);
    expect(v.aanbiedingen[0]?.vanNaam).toBe("Els");
  });

  it("alleen zijn eigen niet-beschikbaar, verlof en uren; nooit die van een collega", () => {
    expect(v.nietBeschikbaar.map((x) => x.id)).toEqual(["n1"]);
    expect(v.verlof).toEqual([]);
    expect(v.uren.map((x) => x.id)).toEqual(["u1"]);
    expect(JSON.stringify(v)).not.toContain("geheim");
  });

  it("weet of hij is ingeklokt", () => {
    expect(v.ingeklokt?.id).toBe("u1");
    expect(planningVoorMedewerker(planning(), personeel, "m2", "2026-11-16").ingeklokt).toBeNull();
  });

  it("zijn eigen verzoeken staan bij 'mijn ruilen' (r4 is van hemzelf, r2 is aan hem gericht)", () => {
    expect(v.mijnRuilen.map((x) => x.ruil.id).sort()).toEqual(["r2", "r4"]);
  });
});
