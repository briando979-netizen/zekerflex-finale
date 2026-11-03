import { describe, expect, it } from "vitest";
import { leesRoute, routeWeergave, voegRouteToe, type RoutePunt } from "@/lib/rijschool/lesroute";

const les = { start: new Date("2026-11-04T09:00:00Z"), eind: new Date("2026-11-04T10:00:00Z") };
const t0 = Math.floor(les.start.getTime() / 1000);

describe("lesroute", () => {
  it("dunt uit: minstens 5 s én 10 m, afgerond op ±10 m", () => {
    const nieuw: RoutePunt[] = [
      [4.900001, 52.370001, t0],
      [4.90002, 52.37, t0 + 2], // te snel na het vorige
      [4.90003, 52.37001, t0 + 10], // < 10 m verder
      [4.9015, 52.3705, t0 + 20],
      [4.903, 52.371, t0 + 40],
    ];
    const r = voegRouteToe([], nieuw, les).punten;
    expect(r).toEqual([
      [4.9, 52.37, t0],
      [4.9015, 52.3705, t0 + 20],
      [4.903, 52.371, t0 + 40],
    ]);
  });

  it("alleen in Nederland en binnen de lestijd", () => {
    const r = voegRouteToe(
      [],
      [
        [2.35, 48.85, t0 + 60], // Parijs
        [4.9, 52.37, t0 - 3600], // een uur voor de les
        [4.9, 52.37, t0 + 7 * 3600], // ruim na de les
        [4.91, 52.38, t0 + 600],
      ],
      les,
    ).punten;
    expect(r).toEqual([[4.91, 52.38, t0 + 600]]);
  });

  it("vult aan zonder dubbel of terug in de tijd", () => {
    const eerst = voegRouteToe([], [[4.9, 52.37, t0 + 100]], les).punten;
    const daarna = voegRouteToe(eerst, [[4.95, 52.37, t0 + 50], [4.91, 52.37, t0 + 200]], les).punten;
    expect(daarna).toEqual([
      [4.9, 52.37, t0 + 100],
      [4.91, 52.37, t0 + 200],
    ]);
  });

  it("weergave voor de leerling met afstand en duur", () => {
    const w = routeWeergave({ v: 1, punten: [[4.9, 52.37, t0], [4.91, 52.37, t0 + 120]] });
    expect(w?.punten).toHaveLength(2);
    expect(w?.meters).toBeGreaterThan(600);
    expect(w?.seconden).toBe(120);
    expect(routeWeergave(null)).toBeNull();
    expect(routeWeergave({ punten: [["x", 1, 2]] })).toBeNull();
    expect(leesRoute({ punten: [[1, 2, 3], [1, "x", 3]] })).toEqual([[1, 2, 3]]);
  });
});
