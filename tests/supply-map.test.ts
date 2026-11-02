import { describe, expect, it, vi } from "vitest";

// Beschikbare krachten op de 3D-kaart: alleen per vak van ~16 km, pas vanaf 3
// mensen, en op het midden van het vak (nooit iemands eigen locatie).

vi.mock("@/lib/storage/kv", () => ({ kvGet: async () => null, kvSet: async () => undefined }));

const { aggregateSupply, CELL_LAT, CELL_LNG } = await import("@/lib/shifts/supply-map");
const { toPlane } = await import("@/lib/shifts/plane");

describe("krachten per regio", () => {
  it("telt per vak en laat vakken met minder dan 3 mensen weg", () => {
    const utrecht = [{ lat: 52.09, lng: 5.12 }, { lat: 52.08, lng: 5.1 }, { lat: 52.1, lng: 5.13 }];
    const eenzaam = [{ lat: 53.2, lng: 6.56 }, { lat: 53.21, lng: 6.55 }];
    const cells = aggregateSupply([...utrecht, ...eenzaam]);
    expect(cells).toHaveLength(1);
    expect(cells[0]?.count).toBe(3);
  });

  it("toont het midden van het vak, niet de locatie van een persoon", () => {
    const people = [{ lat: 52.091, lng: 5.121 }, { lat: 52.092, lng: 5.122 }, { lat: 52.093, lng: 5.123 }];
    const [cell] = aggregateSupply(people);
    expect(cell).toBeDefined();
    if (!cell) return;
    for (const p of people) {
      expect(cell.lat).not.toBe(p.lat);
      expect(cell.lng).not.toBe(p.lng);
    }
    // midden van het vak
    expect(((cell.lat / CELL_LAT) % 1 + 1) % 1).toBeCloseTo(0.5, 5);
    expect(((cell.lng / CELL_LNG) % 1 + 1) % 1).toBeCloseTo(0.5, 5);
  });

  it("negeert lege of nul-coördinaten", () => {
    expect(aggregateSupply([{ lat: 0, lng: 0 }, { lat: 0, lng: 0 }, { lat: 0, lng: 0 }])).toEqual([]);
    expect(aggregateSupply([{ lat: Number.NaN, lng: 5 }, { lat: 52, lng: Number.NaN }, { lat: 52, lng: 5 }])).toEqual([]);
  });

  it("legt Nederland netjes rond het midden op de 3D-plaat", () => {
    const [x, y] = toPlane(5.25, 52.15);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(0);
    const [xGroningen, yGroningen] = toPlane(6.57, 53.22);
    expect(xGroningen).toBeGreaterThan(0);
    expect(yGroningen).toBeGreaterThan(0);
  });
});
