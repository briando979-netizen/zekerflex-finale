import { describe, expect, it } from "vitest";
import { courierRoute, FRONT_Z, RD, roomCenter, RW } from "@/lib/admin/office3d-layout";

// 3D-kantoor: koeriers lopen van de voordeur door de gangen naar hun afdeling
// en komen alleen via de deur (midden voorkant) een afdeling binnen.

const rooms = [0, 1, 2].flatMap((cx) => [0, 1, 2].map((cy) => [cx, cy] as const));

/** Ligt punt (x, z) binnen de muren van een afdeling? */
function insideRoom(x: number, z: number): [number, number] | null {
  for (const [cx, cy] of rooms) {
    const [rx, rz] = roomCenter(cx, cy);
    if (Math.abs(x - rx) < RW / 2 - 0.01 && Math.abs(z - rz) < RD / 2 - 0.01) return [cx, cy];
  }
  return null;
}

describe("route van een koerier", () => {
  it("begint bij de voordeur en eindigt midden in de afdeling", () => {
    for (const [cx, cy] of rooms) {
      const route = courierRoute(cx, cy);
      expect(route[0]).toEqual([0, FRONT_Z]);
      expect(route[route.length - 1]).toEqual(roomCenter(cx, cy));
    }
  });

  it("loopt nergens door een andere afdeling heen", () => {
    for (const [cx, cy] of rooms) {
      const route = courierRoute(cx, cy);
      // alle stukken behalve het laatste (deur → midden) liggen in de gangen
      for (let i = 0; i < route.length - 2; i++) {
        const [ax, az] = route[i]!;
        const [bx, bz] = route[i + 1]!;
        for (let t = 0; t <= 1; t += 0.02) {
          const inside = insideRoom(ax + (bx - ax) * t, az + (bz - az) * t);
          expect(inside, `afdeling ${cx},${cy}, stuk ${i}`).toBeNull();
        }
      }
    }
  });

  it("gaat via de deur in het midden van de voorkant naar binnen", () => {
    for (const [cx, cy] of rooms) {
      const route = courierRoute(cx, cy);
      const [rx, rz] = roomCenter(cx, cy);
      expect(route[route.length - 2]).toEqual([rx, rz + RD / 2]);
    }
  });
});
