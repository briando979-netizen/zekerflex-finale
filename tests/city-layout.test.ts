import { describe, expect, it } from "vitest";
import {
  COMPANY_SLOTS,
  companyFloors,
  dayPhase,
  EXITS,
  HOUSE_SLOTS,
  houseCount,
  LANDMARKS,
  LANE_BIKE,
  LANE_CAR,
  laneOffset,
  LINES,
  millSpeed,
  type Plot,
  type Pt,
  ROAD_W,
  roadSpan,
  sunAt,
  trafficFor,
  tripCenter,
} from "@/lib/admin/city-layout";

// Stad rond het 3D-kantoor: geen gebouw staat op een weg, voertuigen rijden
// alleen over wegen (rechts), en elke echte gebeurtenis krijgt een herkomst.

const plots: [string, Plot][] = [
  ...Object.entries(LANDMARKS),
  ...COMPANY_SLOTS.map((p, i) => [`bedrijf ${i}`, p] as [string, Plot]),
  ...HOUSE_SLOTS.map((p, i) => [`huis ${i}`, p] as [string, Plot]),
];

const onLine = (v: number) => LINES.some((l) => Math.abs(l - v) < 1e-9);

/** Ligt het stuk a→b op één weg, binnen de lengte van die weg? */
function onRoad(a: Pt, b: Pt): boolean {
  if (Math.abs(a[1] - b[1]) < 1e-9 && onLine(a[1])) {
    const [lo, hi] = roadSpan("h", a[1]);
    return Math.min(a[0], b[0]) >= lo - 1e-9 && Math.max(a[0], b[0]) <= hi + 1e-9;
  }
  if (Math.abs(a[0] - b[0]) < 1e-9 && onLine(a[0])) {
    const [lo, hi] = roadSpan("v", a[0]);
    return Math.min(a[1], b[1]) >= lo - 1e-9 && Math.max(a[1], b[1]) <= hi + 1e-9;
  }
  return false;
}

const dir = (a: Pt, b: Pt): Pt => {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
};

const origins: [string, { door?: Pt; road: Plot["road"] }][] = [
  ...plots.filter(([, p]) => p !== LANDMARKS.hq),
  ["afrit oost", { road: EXITS.oost }],
  ["afrit west", { road: EXITS.west }],
];

describe("indeling van de stad", () => {
  it("zet geen gebouw op een weg", () => {
    const half = ROAD_W / 2;
    for (const [name, p] of plots) {
      for (const l of LINES) {
        const hitsV = p.x + p.w / 2 > l - half && p.x - p.w / 2 < l + half;
        const hitsH = p.z + p.d / 2 > l - half && p.z - p.d / 2 < l + half;
        expect(hitsV, `${name} raakt de weg x = ${l}`).toBe(false);
        expect(hitsH, `${name} raakt de weg z = ${l}`).toBe(false);
      }
    }
  });

  it("laat geen twee gebouwen overlappen", () => {
    for (let i = 0; i < plots.length; i++) {
      for (let k = i + 1; k < plots.length; k++) {
        const [na, a] = plots[i]!;
        const [nb, b] = plots[k]!;
        const overlap = Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.z - b.z) < (a.d + b.d) / 2;
        expect(overlap, `${na} en ${nb}`).toBe(false);
      }
    }
  });

  it("geeft elke deur een oprit loodrecht op een weg, nooit op een kruispunt", () => {
    for (const [name, p] of plots) {
      const { road, door } = p;
      expect(onLine(road.axis === "h" ? road.z : road.x), name).toBe(true);
      expect(onLine(road.axis === "h" ? road.x : road.z), `${name} ligt op een kruispunt`).toBe(false);
      if (road.axis === "h") expect(door[0], name).toBe(road.x);
      else expect(door[1], name).toBe(road.z);
    }
  });

  it("heeft genoeg kavels: twaalf klantkantoren en een woonwijk", () => {
    expect(COMPANY_SLOTS).toHaveLength(12);
    expect(HOUSE_SLOTS.length).toBeGreaterThanOrEqual(60);
  });
});

describe("ritten", () => {
  it("rijden van elke herkomst naar het kantoor alleen over wegen", () => {
    for (const [name, from] of origins) {
      // de opritten (deur ↔ weg) liggen per definitie naast de weg
      const trips: [Pt[], boolean, boolean][] = [
        [tripCenter(from, LANDMARKS.hq), Boolean(from.door), true],
        [tripCenter(LANDMARKS.hq, from), true, Boolean(from.door)],
      ];
      for (const [trip, skipFirst, skipLast] of trips) {
        for (let i = skipFirst ? 1 : 0; i < trip.length - (skipLast ? 2 : 1); i++) {
          const a = trip[i]!;
          const b = trip[i + 1]!;
          expect(onRoad(a, b), `${name}: stuk ${i} ${a} → ${b}`).toBe(true);
        }
      }
    }
  });

  it("maken nooit een keerbocht", () => {
    for (const [name, from] of origins) {
      const trip = tripCenter(from, LANDMARKS.hq);
      for (let i = 1; i < trip.length - 1; i++) {
        const d1 = dir(trip[i - 1]!, trip[i]!);
        const d2 = dir(trip[i]!, trip[i + 1]!);
        expect(d1[0] * d2[0] + d1[1] * d2[1], `${name}: bocht ${i}`).toBeGreaterThan(-0.5);
      }
    }
  });

  it("houden rechts aan: auto's op hun rijstrook, fietsers op het fietspad", () => {
    expect(LANE_BIKE).toBeLessThan(ROAD_W / 2);
    expect(LANE_CAR).toBeLessThan(LANE_BIKE);
    for (const off of [LANE_CAR, LANE_BIKE]) {
      for (const [name, from] of origins) {
        const center = tripCenter(from, LANDMARKS.hq);
        const lane = laneOffset(center, off);
        expect(lane).toHaveLength(center.length);
        for (let i = 0; i < center.length - 1; i++) {
          const [dx, dz] = dir(center[i]!, center[i + 1]!);
          const right: Pt = [-dz, dx];
          for (const k of [i, i + 1]) {
            const shift = (lane[k]![0] - center[k]![0]) * right[0] + (lane[k]![1] - center[k]![1]) * right[1];
            expect(shift, `${name}: stuk ${i}`).toBeCloseTo(off, 6);
          }
        }
      }
    }
  });

  it("rijdt naar het noorden aan de oostkant van de weg", () => {
    const lane = laneOffset(
      [
        [24, 10],
        [24, -10],
      ],
      LANE_CAR,
    );
    expect(lane[0]![0]).toBeCloseTo(24 + LANE_CAR);
  });
});

describe("herkomst van gebeurtenissen", () => {
  const companies = new Set(["t1"]);

  it("laat een gebeurtenis van een klant met een pand uit dat pand vertrekken", () => {
    expect(trafficFor({ room: "operations", action: "timesheet.approved", tenantId: "t1" }, companies)).toEqual({ from: "bedrijf:t1", kind: "bus" });
    expect(trafficFor({ room: "operations", action: "timesheet.approved", tenantId: "onbekend" }, companies).from).toBe("woonwijk");
  });

  it("koppelt elke afdeling aan een plek in de stad", () => {
    expect(trafficFor({ room: "shop", action: "shop.order_paid" }, companies)).toEqual({ from: "magazijn", kind: "bestelbus" });
    expect(trafficFor({ room: "bank", action: "bank.topup" }, companies).kind).toBe("geldwagen");
    expect(trafficFor({ room: "support", action: "mail.sent" }, companies).from).toBe("oost");
    expect(trafficFor({ room: "ai", action: "orchestration.run" }, companies).from).toBe("datacenter");
    expect(trafficFor({ room: "legal", action: "kyc.decision" }, companies).from).toBe("woonwijk");
    expect(trafficFor({ room: "hq", action: "admin.setting" }, companies).from).toBe("oost");
  });
});

describe("cijfers naar gebouwen", () => {
  it("bouwt één huis per werker, tot de wijk vol is", () => {
    expect(houseCount(0)).toBe(0);
    expect(houseCount(7)).toBe(7);
    expect(houseCount(10_000)).toBe(HOUSE_SLOTS.length);
  });

  it("maakt klantkantoren 2 tot 9 verdiepingen hoog", () => {
    expect(companyFloors({ branches: 0, openShifts: 0, shiftsWeek: 0 })).toBe(2);
    expect(companyFloors({ branches: 2, openShifts: 3, shiftsWeek: 3 })).toBe(6);
    expect(companyFloors({ branches: 40, openShifts: 99, shiftsWeek: 99 })).toBe(9);
  });

  it("laat de molen nooit stilstaan en sneller draaien bij drukte", () => {
    expect(millSpeed(0)).toBeGreaterThan(0);
    expect(millSpeed(40)).toBeGreaterThan(millSpeed(4));
    expect(millSpeed(1e6)).toBeLessThan(3);
  });

  it("zet de zon zoals boven Amsterdam: hoog in juni, laag in december, weg om middernacht", () => {
    const deg = (d: string) => (sunAt(new Date(d)).elevation * 180) / Math.PI;
    expect(deg("2026-06-21T11:40:00Z")).toBeGreaterThan(58);
    expect(deg("2026-06-21T11:40:00Z")).toBeLessThan(64);
    expect(deg("2026-12-21T11:40:00Z")).toBeGreaterThan(11);
    expect(deg("2026-12-21T11:40:00Z")).toBeLessThan(17);
    expect(dayPhase(sunAt(new Date("2026-11-03T23:00:00Z")).elevation)).toBe("nacht");
    // 3 november, 18:30 in Amsterdam: al donker (de zon ging rond 17:00 onder)
    expect(dayPhase(sunAt(new Date("2026-11-03T17:30:00Z")).elevation)).toBe("nacht");
    expect(dayPhase(sunAt(new Date("2026-11-03T11:30:00Z")).elevation)).toBe("dag");
  });

  it("laat de zon 's ochtends in het oosten en 's middags in het zuiden staan", () => {
    const morning = sunAt(new Date("2026-06-21T05:00:00Z")).dir;
    const noon = sunAt(new Date("2026-06-21T11:40:00Z")).dir;
    expect(morning[0]).toBeGreaterThan(0.5); // oost = +x
    expect(noon[1]).toBeGreaterThan(0.95); // zuid = +z
  });
});
