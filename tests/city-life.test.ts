import { describe, expect, it } from "vitest";
import { CANAL_Z, COMPANY_SLOTS, HOUSE_SLOTS, LANDMARKS, LINES, type Plot, ROAD_W, roadSpan } from "@/lib/admin/city-layout";
import { alongLoop, BENCHES, blockWeight, crowdSize, fireworksOn, hourlyCounts, pickBlock, treeLook, yearSeason, DITCHES, FARM, inPond, inRect, loopLength, MEADOW_COWS, MEADOW_SHEEP, POND, precipitationAmount, sidewalkLoop, steerInside, weatherKind } from "@/lib/admin/city-life";

// Leven in de 3D-stad: voetgangers blijven op de stoep, bankjes staan vrij,
// dieren blijven in hun wei of op het water, en het weer volgt de echte code.

/** Ligt (x, z) op een weg (tussen de stoepranden)? */
function onRoad(x: number, z: number): boolean {
  for (const l of LINES) {
    const [hx0, hx1] = roadSpan("h", l);
    if (Math.abs(z - l) < ROAD_W / 2 && x >= hx0 - ROAD_W / 2 && x <= hx1 + ROAD_W / 2) return true;
    const [vz0, vz1] = roadSpan("v", l);
    if (Math.abs(x - l) < ROAD_W / 2 && z >= vz0 - ROAD_W / 2 && z <= vz1 + ROAD_W / 2) return true;
  }
  return false;
}

const plots: Plot[] = [...Object.values(LANDMARKS).filter((p) => p !== LANDMARKS.hq && p !== LANDMARKS.park), ...COMPANY_SLOTS, ...HOUSE_SLOTS];
const inPlot = (x: number, z: number) => plots.some((p) => Math.abs(x - p.x) < p.w / 2 && Math.abs(z - p.z) < p.d / 2);

describe("voetgangers", () => {
  it("lopen hun rondje over de stoep, nooit over de weg", () => {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        const loop = sidewalkLoop(i, j);
        for (let t = 0; t < 1; t += 0.01) {
          const { at } = alongLoop(loop, t);
          expect(onRoad(at[0], at[1]), `blok ${i},${j} bij ${t.toFixed(2)}: ${at}`).toBe(false);
        }
      }
    }
  });

  it("lopen aan de binnenkant van de stoep, tussen de stoeprand en de bouwgrond", () => {
    const [a] = sidewalkLoop(1, 1);
    // blok (1,1) begint bij de wegen x = -48 en z = -48
    expect(a?.[0]).toBeCloseTo(-48 + 2.9);
    expect(a?.[1]).toBeCloseTo(-48 + 2.9);
  });

  it("gaan het rondje helemaal rond, met een richting langs de stoep", () => {
    const loop = sidewalkLoop(2, 2);
    expect(loopLength(loop)).toBeCloseTo(4 * (42 + 0.2), 5);
    const { dir } = alongLoop(loop, 0.1);
    expect(Math.hypot(dir[0], dir[1])).toBeCloseTo(1);
    expect(alongLoop(loop, 1.25).at).toEqual(alongLoop(loop, 0.25).at);
  });

  it("lopen vaker in het centrum dan aan de rand van de stad", () => {
    const hits = new Map<string, number>();
    for (let k = 0; k < 2000; k++) {
      const [i, j] = pickBlock((k + 0.5) / 2000);
      expect(i >= 0 && i < 5 && j >= 0 && j < 5).toBe(true);
      hits.set(`${i},${j}`, (hits.get(`${i},${j}`) ?? 0) + 1);
    }
    expect(hits.get("2,2") ?? 0).toBeGreaterThan(hits.get("0,0") ?? 0);
    expect(hits.size).toBe(25);
    expect(blockWeight(2, 2)).toBeGreaterThan(blockWeight(4, 4));
  });

  it("zijn overdag druk en 's nachts rustig; bezoekers tellen altijd mee, tot 40", () => {
    expect(crowdSize("dag", 0, "helder").residents).toBeGreaterThan(crowdSize("nacht", 0, "helder").residents);
    expect(crowdSize("dag", 0, "regen").residents).toBeLessThan(crowdSize("dag", 0, "helder").residents);
    expect(crowdSize("nacht", 3, "helder").visitors).toBe(3);
    expect(crowdSize("dag", 500, "helder").visitors).toBe(40);
  });
});

describe("bankjes", () => {
  it("staan nooit op een weg of in een gebouw", () => {
    for (const b of BENCHES) {
      expect(onRoad(b.x, b.z), `bankje ${b.x},${b.z}`).toBe(false);
      expect(inPlot(b.x, b.z), `bankje ${b.x},${b.z}`).toBe(false);
    }
  });
});

describe("dieren", () => {
  it("hebben hun wei buiten de stad, niet in de gracht en niet op een sloot", () => {
    for (const m of [MEADOW_COWS, MEADOW_SHEEP]) {
      expect(m.z1).toBeLessThan(-80);
      expect(m.z0 > CANAL_Z[1] || m.z1 < CANAL_Z[0]).toBe(true);
      for (const d of DITCHES) {
        const overlap = m.x0 < d.x1 && m.x1 > d.x0 && m.z0 < d.z1 && m.z1 > d.z0;
        expect(overlap).toBe(false);
      }
    }
    expect(inRect(MEADOW_COWS, FARM[0], FARM[1])).toBe(false);
    expect(inRect(MEADOW_SHEEP, FARM[0], FARM[1])).toBe(false);
  });

  it("worden teruggestuurd als ze de rand van hun wei naderen", () => {
    const h = steerInside(MEADOW_COWS, MEADOW_COWS.x0 + 0.5, (MEADOW_COWS.z0 + MEADOW_COWS.z1) / 2, Math.PI);
    expect(Math.sin(h)).toBeGreaterThan(0.9); // terug naar het oosten (+x)
    expect(steerInside(MEADOW_COWS, -60, -110, 1.23)).toBe(1.23);
  });

  it("zwemmen in de vijver", () => {
    expect(inPond(POND.x, POND.z)).toBe(true);
    expect(inPond(POND.x + POND.rx + 1, POND.z)).toBe(false);
  });
});

describe("drukte per uur", () => {
  it("telt de gebeurtenissen per Nederlands klokuur, het lopende uur achteraan", () => {
    const now = Date.parse("2026-11-04T09:25:00Z"); // 10:25 in Amsterdam
    const times = [Date.parse("2026-11-04T09:05:00Z"), Date.parse("2026-11-04T09:24:00Z"), Date.parse("2026-11-04T08:59:00Z"), Date.parse("2026-11-03T10:30:00Z"), Date.parse("2026-11-02T09:00:00Z")];
    const { labels, values } = hourlyCounts(times, now);
    expect(labels).toHaveLength(24);
    expect(labels[23]).toBe("10:00");
    expect(labels[22]).toBe("09:00");
    expect(values[23]).toBe(2);
    expect(values[22]).toBe(1);
    expect(values[0]).toBe(1); // 11:00 gisteren (10:30 UTC)
    expect(values.reduce((s, v) => s + v, 0)).toBe(4); // eergisteren valt erbuiten
  });
});

describe("seizoenen en feestdagen", () => {
  it("volgt de Nederlandse seizoenen", () => {
    expect(yearSeason(3)).toBe("lente");
    expect(yearSeason(7)).toBe("zomer");
    expect(yearSeason(11)).toBe("herfst");
    expect(yearSeason(12)).toBe("winter");
    expect(yearSeason(2)).toBe("winter");
  });

  it("kleurt de bomen naar het seizoen: kaal in de winter, herfstkleuren in november", () => {
    const sample = (s: Parameters<typeof treeLook>[0]) => Array.from({ length: 200 }, (_, k) => treeLook(s, (k + 0.5) / 200));
    const winter = sample("winter");
    expect(winter.filter((t) => t.bare).length).toBeGreaterThan(100);
    expect(sample("zomer").some((t) => t.bare)).toBe(false);
    // herfst: het grootste deel oranje/geel/bruin (rood-kanaal sterker dan groen)
    const warm = sample("herfst").filter((t) => (t.color >> 16) > ((t.color >> 8) & 0xff)).length;
    expect(warm).toBeGreaterThan(150);
    // lente: een deel bloeit
    expect(sample("lente").filter((t) => t.color === 0xf9a8d4 || t.color === 0xfdf2f8).length).toBeGreaterThan(10);
  });

  it("steekt alleen rond de jaarwisseling vuurwerk af", () => {
    expect(fireworksOn("oudjaar", 21, true)).toBe(true);
    expect(fireworksOn("oudjaar", 12, false)).toBe(false);
    expect(fireworksOn("nieuwjaar", 1, true)).toBe(true);
    expect(fireworksOn("nieuwjaar", 14, false)).toBe(false);
    expect(fireworksOn("kerst", 22, true)).toBe(false);
    expect(fireworksOn(null, 22, true)).toBe(false);
  });
});

describe("weer", () => {
  it("vertaalt het weersymbool van MET Norway naar het weer in de stad", () => {
    expect(weatherKind("clearsky_day")).toBe("helder");
    expect(weatherKind("fair_night")).toBe("helder");
    expect(weatherKind("partlycloudy_day", 30)).toBe("helder");
    expect(weatherKind("partlycloudy_day", 80)).toBe("bewolkt");
    expect(weatherKind("cloudy")).toBe("bewolkt");
    expect(weatherKind("fog")).toBe("mist");
    expect(weatherKind("lightrain")).toBe("motregen");
    expect(weatherKind("lightrainshowers_day")).toBe("motregen");
    expect(weatherKind("heavyrain")).toBe("regen");
    expect(weatherKind("rainshowers_night")).toBe("regen");
    expect(weatherKind("lightsnow")).toBe("sneeuw");
    expect(weatherKind("sleet")).toBe("sneeuw");
    expect(weatherKind("heavyrainandthunder")).toBe("onweer");
  });

  it("laat het harder regenen bij meer neerslag, en droog weer zonder druppels", () => {
    expect(precipitationAmount("helder")).toBe(0);
    expect(precipitationAmount("regen", 3)).toBeGreaterThan(precipitationAmount("regen", 0.2));
    expect(precipitationAmount("sneeuw")).toBeGreaterThan(0);
  });
});
