// Indeling van het 3D-kantoor (components/admin/Office3D.tsx): negen afdelingen
// van RW × RD in een raster van 3 × 3, met gangen van GAP ertussen. Koeriers
// lopen van de voordeur alleen door gangen en gaan een afdeling binnen via de
// deur in het midden van de voorkant, zodat ze nooit door een muur lopen.

export const RW = 10;
export const RD = 8;
export const GAP = 2.4;

/** Midden van een afdeling in de wereld (x, z); kolom cx en rij cy lopen van 0 tot 2. */
export const roomCenter = (cx: number, cy: number): [number, number] => [(cx - 1) * (RW + GAP), (cy - 1) * (RD + GAP)];

/** De voordeur: midden voor het gebouw. */
export const FRONT_Z = roomCenter(1, 2)[1] + RD / 2 + GAP + 3;

/** Route van de voordeur via de gangen naar het midden van een afdeling. */
export function courierRoute(cx: number, cy: number): [number, number][] {
  const [rx, rz] = roomCenter(cx, cy);
  const corridorX = (cx <= 1 ? -1 : 1) * (RW / 2 + GAP / 2);
  const corridorZ = rz + RD / 2 + GAP / 2;
  return [
    [0, FRONT_Z],
    [corridorX, FRONT_Z],
    [corridorX, corridorZ],
    [rx, corridorZ],
    [rx, rz + RD / 2],
    [rx, rz],
  ];
}
