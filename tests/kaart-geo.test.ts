import { describe, expect, it } from "vitest";
import { afstand, afstandTekst, bewaarPunt, duurTekst, gpx, leesPdokResultaten, lijnLengte, ritStand, type RitPunt } from "@/lib/kaart/geo";

const DAM: [number, number] = [4.8936, 52.3731];
const UTRECHT_DOM: [number, number] = [5.1214, 52.0907];

describe("afstanden", () => {
  it("Dam tot Domtoren is ongeveer 35 km", () => {
    const m = afstand(DAM, UTRECHT_DOM);
    expect(m).toBeGreaterThan(34_500);
    expect(m).toBeLessThan(36_000);
  });
  it("lijnlengte telt de stukken op", () => {
    expect(lijnLengte([DAM, UTRECHT_DOM, DAM])).toBeCloseTo(2 * afstand(DAM, UTRECHT_DOM), 3);
    expect(lijnLengte([DAM])).toBe(0);
  });
  it("tekst in gewoon Nederlands", () => {
    expect(afstandTekst(850.4)).toBe("850 m");
    expect(afstandTekst(12_430)).toBe("12,4 km");
    expect(duurTekst(45)).toBe("45 s");
    expect(duurTekst(12 * 60)).toBe("12 min");
    expect(duurTekst(65 * 60)).toBe("1 u 05 min");
  });
});

describe("een rit opnemen", () => {
  const start: RitPunt = { lon: 4.9, lat: 52.37, t: 0, nauwkeurigheid: 5 };
  it("slaat ruis, stilstand en onnauwkeurige punten over", () => {
    const rit = [start];
    expect(bewaarPunt(rit, { lon: 4.90001, lat: 52.37, t: 1000, nauwkeurigheid: 5 })).toBe(false); // < 4 m
    expect(bewaarPunt(rit, { lon: 4.901, lat: 52.37, t: 1000, nauwkeurigheid: 120 })).toBe(false); // te onnauwkeurig
    expect(bewaarPunt(rit, { lon: 4.901, lat: 52.37, t: 0 })).toBe(false); // geen tijd vooruit
    expect(bewaarPunt(rit, { lon: 4.901, lat: 52.37, t: 1000, nauwkeurigheid: 8 })).toBe(true);
    expect(bewaarPunt([], start)).toBe(true);
  });
  it("berekent afstand, duur en snelheid", () => {
    // ~68 m per seconde = ~245 km/u is onzin, dus nemen we 10 s per 68 m ≈ 24,5 km/u
    const rit: RitPunt[] = Array.from({ length: 11 }, (_, i) => ({ lon: 4.9 + i * 0.001, lat: 52.37, t: i * 10_000 }));
    const s = ritStand(rit);
    expect(s.seconden).toBe(100);
    expect(s.meters).toBeGreaterThan(670);
    expect(s.meters).toBeLessThan(690);
    expect(s.gemiddeld).toBeGreaterThan(24);
    expect(s.gemiddeld).toBeLessThan(25);
    expect(s.nu).toBeGreaterThan(24);
  });
  it("GPX is geldig en ontsnapt de naam", () => {
    const g = gpx([start, { lon: 4.91, lat: 52.38, t: 60_000 }], 'Les <1> & "zo"');
    expect(g).toContain('<gpx version="1.1"');
    expect(g).toContain("<name>Les &lt;1&gt; &amp; &quot;zo&quot;</name>");
    expect(g.match(/<trkpt /g)).toHaveLength(2);
    expect(g).toContain("<time>1970-01-01T00:01:00.000Z</time>");
  });
});

describe("PDOK-resultaten", () => {
  it("leest adressen met coördinaten en laat onzin weg", () => {
    const r = leesPdokResultaten({
      response: {
        docs: [
          { weergavenaam: "Dam 1, 1012JS Amsterdam", type: "adres", centroide_ll: "POINT(4.89260 52.37306)" },
          { weergavenaam: "Kapot", type: "adres", centroide_ll: "nee" },
          { type: "weg", centroide_ll: "POINT(4 52)" },
          { weergavenaam: "Utrecht", type: "woonplaats", centroide_ll: "POINT(5.1 52.09)" },
        ],
      },
    });
    expect(r).toEqual([
      { naam: "Dam 1, 1012JS Amsterdam", soort: "Adres", lon: 4.8926, lat: 52.37306 },
      { naam: "Utrecht", soort: "Plaats", lon: 5.1, lat: 52.09 },
    ]);
    expect(leesPdokResultaten(null)).toEqual([]);
  });
});
