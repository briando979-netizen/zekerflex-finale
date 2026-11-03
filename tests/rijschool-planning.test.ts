import { describe, expect, it } from "vitest";
import { conflict, komendeDagen, leesWerktijden, moment, vrijeTijden, weekdagVan } from "@/lib/rijschool/planning";
import { tegoedTekst, lesduur, saldo } from "@/lib/rijschool/tegoed";
import { amsterdamClock } from "@/lib/time/amsterdam";

const klok = (ds: Date[]) => ds.map((d) => amsterdamClock(d));

describe("rijschool planning", () => {
  it("weekdag: maandag is 1, zondag is 7", () => {
    expect(weekdagVan("2026-11-02")).toBe(1);
    expect(weekdagVan("2026-11-08")).toBe(7);
  });

  it("een Nederlandse kloktijd wordt het juiste moment, ook rond de wintertijd", () => {
    // 25 oktober 2026: de klok gaat van 3:00 naar 2:00
    expect(moment("2026-10-24", "10:00").toISOString()).toBe("2026-10-24T08:00:00.000Z");
    expect(moment("2026-10-26", "10:00").toISOString()).toBe("2026-10-26T09:00:00.000Z");
  });

  it("vrije tijden volgen de werktijden en slaan bezette blokken over", () => {
    const nu = new Date("2026-11-01T12:00:00Z");
    const tijden = vrijeTijden({
      werktijden: [{ dag: 2, van: "09:00", tot: "13:00" }],
      bezet: [{ start: moment("2026-11-03", "10:00"), eind: moment("2026-11-03", "11:00") }],
      datum: "2026-11-03",
      duurMin: 60,
      nu,
    });
    expect(klok(tijden)).toEqual(["09:00", "11:00", "11:30", "12:00"]);
  });

  it("geen tijden op een dag zonder werktijden, of te kort van tevoren", () => {
    const werktijden = [{ dag: 2, van: "09:00", tot: "12:00" }];
    expect(vrijeTijden({ werktijden, bezet: [], datum: "2026-11-04", duurMin: 60, nu: new Date("2026-11-01T00:00:00Z") })).toEqual([]);
    const nu = moment("2026-11-03", "08:00");
    const tijden = vrijeTijden({ werktijden, bezet: [], datum: "2026-11-03", duurMin: 60, nu, minVoorafMin: 120 });
    expect(klok(tijden)).toEqual(["10:00", "10:30", "11:00"]);
  });

  it("ongeldige werktijden uit de database vallen weg", () => {
    expect(leesWerktijden([{ dag: 1, van: "09:00", tot: "17:00" }, { dag: 8, van: "09:00", tot: "17:00" }, { dag: 2, van: "17:00", tot: "09:00" }, "x"])).toEqual([
      { dag: 1, van: "09:00", tot: "17:00" },
    ]);
    expect(leesWerktijden(null)).toEqual([]);
  });

  it("dubbele boekingen: instructeur, leerling en auto", () => {
    const start = moment("2026-11-03", "10:00");
    const eind = moment("2026-11-03", "11:00");
    const bestaand = [{ id: "a", start, eind, instructeurId: "i1", leerlingId: "l1", voertuigId: "v1" }];
    const half = { start: moment("2026-11-03", "10:30"), eind: moment("2026-11-03", "11:30") };
    expect(conflict({ ...half, instructeurId: "i1", leerlingId: null, voertuigId: null }, bestaand)).toMatch(/instructeur/);
    expect(conflict({ ...half, instructeurId: "i2", leerlingId: "l1", voertuigId: null }, bestaand)).toMatch(/leerling/);
    expect(conflict({ ...half, instructeurId: "i2", leerlingId: "l2", voertuigId: "v1" }, bestaand)).toMatch(/auto/);
    // aansluitend is geen overlap
    expect(conflict({ start: eind, eind: moment("2026-11-03", "12:00"), instructeurId: "i1", leerlingId: "l1", voertuigId: "v1" }, bestaand)).toBeNull();
    // dezelfde les verzetten botst niet met zichzelf
    expect(conflict({ ...half, id: "a", instructeurId: "i1", leerlingId: "l1", voertuigId: "v1" }, bestaand)).toBeNull();
    expect(conflict({ start: eind, eind: start, instructeurId: "i1", leerlingId: null, voertuigId: null }, [])).toMatch(/na de begintijd/);
  });

  it("komende dagen in Nederlandse tijd", () => {
    // 23:30 UTC op 2 november is al 3 november in Nederland
    expect(komendeDagen(new Date("2026-11-02T23:30:00Z"), 3)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05"]);
  });
});

describe("rijschool tegoed", () => {
  it("saldo en tekst", () => {
    expect(saldo([{ minuten: 600 }, { minuten: -60 }, { minuten: -90 }])).toBe(450);
    expect(tegoedTekst(0, 60)).toBe("Geen tegoed");
    expect(tegoedTekst(60, 60)).toBe("1 les");
    expect(tegoedTekst(270, 60)).toBe("4 lessen en 30 min");
    expect(tegoedTekst(30, 60)).toBe("30 min");
    expect(tegoedTekst(-120, 60)).toBe("2 lessen te weinig");
  });

  it("lesduur in minuten", () => {
    expect(lesduur("2026-11-03T09:00:00Z", "2026-11-03T10:30:00Z")).toBe(90);
    expect(lesduur("2026-11-03T10:00:00Z", "2026-11-03T09:00:00Z")).toBe(0);
  });
});
