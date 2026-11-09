import { describe, expect, it } from "vitest";
import { berekenDrukte, teWeinigGeplaatst } from "@/lib/planner/drukte";
import { planWeek } from "@/lib/planner/week";

// Week 46 van 2026: maandag 9 t/m zondag 15 november (wintertijd).
const week = planWeek("2026-W46")!;
const d = (iso: string, plekken = 1) => ({ start: new Date(iso), plekken });

describe("berekenDrukte", () => {
  it("geeft niets bij te weinig historie", () => {
    expect(berekenDrukte([], week.van)).toBeNull();
    // één week met diensten is geen gemiddelde
    expect(berekenDrukte([d("2026-11-07T10:00:00+01:00", 3), d("2026-11-06T10:00:00+01:00", 3), d("2026-11-05T10:00:00+01:00"), d("2026-11-04T10:00:00+01:00")], week.van)).toBeNull();
  });

  it("middelt per weekdag over de weken sinds de oudste dienst, ook lege weken", () => {
    const historie = [
      // zaterdagen: 7 nov (4 plekken) en 24 okt (2 plekken); 31 okt leeg
      d("2026-11-07T18:00:00+01:00", 4),
      d("2026-10-24T18:00:00+02:00", 2),
      // maandagen
      d("2026-11-02T09:00:00+01:00", 3),
      d("2026-10-26T09:00:00+01:00", 3),
    ];
    const uit = berekenDrukte(historie, week.van)!;
    expect(uit.weken).toBe(3);
    expect(uit.dagen.map((x) => x.datum)).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
    expect(uit.dagen[0]?.verwacht).toBe(2); // (3 + 3) / 3
    expect(uit.dagen[5]?.verwacht).toBe(2); // (4 + 2) / 3
    expect(uit.dagen[2]?.verwacht).toBe(0);
  });

  it("telt de dienst in de gekozen week als geplaatst, op de Nederlandse dag", () => {
    const historie = [
      d("2026-11-07T18:00:00+01:00", 4),
      d("2026-10-31T18:00:00+01:00", 4),
      d("2026-11-02T09:00:00+01:00", 1),
      d("2026-10-26T09:00:00+01:00", 1),
      // zaterdag 14 nov 00:30 NL = vrijdag 23:30 UTC: hoort bij zaterdag
      d("2026-11-14T00:30:00+01:00", 1),
      // maandag 16 nov valt buiten de week
      d("2026-11-16T09:00:00+01:00", 5),
    ];
    const uit = berekenDrukte(historie, week.van)!;
    expect(uit.dagen[5]).toMatchObject({ datum: "2026-11-14", verwacht: 4, geplaatst: 1 });
    expect(uit.dagen[4]?.geplaatst).toBe(0);
    expect(uit.dagen.reduce((n, x) => n + x.geplaatst, 0)).toBe(1);
    expect(teWeinigGeplaatst(uit.dagen[5]!)).toBe(true);
    expect(teWeinigGeplaatst(uit.dagen[0]!)).toBe(true); // maandag: verwacht 1, geplaatst 0
    expect(teWeinigGeplaatst(uit.dagen[1]!)).toBe(false); // dinsdag: verwacht 0, geplaatst 0
  });

  it("kijkt niet verder terug dan 8 weken", () => {
    const historie = [d("2026-11-07T18:00:00+01:00", 2), d("2026-10-31T18:00:00+01:00", 2), d("2026-11-03T09:00:00+01:00"), d("2026-11-04T09:00:00+01:00"), d("2026-08-01T18:00:00+02:00", 100)];
    const uit = berekenDrukte(historie, week.van)!;
    expect(uit.weken).toBe(2);
    expect(uit.dagen[5]?.verwacht).toBe(2);
  });
});
