// Zelf rondlopen of rondrijden door de 3D-stad van Beheer → Kantoor (13 nov 2026, eigenaar: "ik kan nog steeds niet de
// hele stad verkennen"). Puur rekenwerk: waar sta je, waar kijk je naartoe, en hoe verandert dat met toetsen, slepen of
// de knoppen op de telefoon. De camera zelf zet components/admin/city/scene.ts. Kijkrichting `kijk` werkt zoals bij
// de voertuigen: vooruit = (sin kijk, cos kijk) in (x, z).

export type Gang = "lopen" | "rijden";

export const GANGEN: Record<Gang, { snelheid: number; oog: number; naam: string }> = {
  lopen: { snelheid: 6, oog: 1.7, naam: "Rondlopen" },
  rijden: { snelheid: 26, oog: 1.25, naam: "Rondrijden" },
};

/** Zo ver loopt de grond door; verder ga je niet (daar is alleen nevel). */
export const GRENS = { x0: -580, x1: 580, z0: -280, z1: 560 } as const;
/** Hoe snel je draait met de pijltjes (radialen per seconde) en hoe ver je omhoog of omlaag kunt kijken. */
export const DRAAI_PER_S = 1.7;
export const KIJK_MAX = 0.9;
/** Met Shift (of de knop "Sneller") ga je zo veel sneller. */
export const SNEL = 2.5;

export interface Verkenstand {
  x: number;
  z: number;
  /** waar je naartoe kijkt (horizontaal) */
  kijk: number;
  /** omhoog (+) of omlaag (−) kijken */
  op: number;
  gang: Gang;
}

/** Wat je nu indrukt: elk tussen −1 en 1 (toetsen en knoppen tellen samen). */
export interface Invoer {
  vooruit: number;
  opzij: number;
  draai: number;
  snel: boolean;
}

export const GEEN_INVOER: Invoer = { vooruit: 0, opzij: 0, draai: 0, snel: false };

const tussen = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Eenheidsvector vooruit (x, z). */
export const vooruitVan = (kijk: number): [number, number] => [Math.sin(kijk), Math.cos(kijk)];
/** Eenheidsvector naar rechts (x, z), zoals in laneOffset: rechts van (dx, dz) is (−dz, dx). */
export const rechtsVan = (kijk: number): [number, number] => {
  const [fx, fz] = vooruitVan(kijk);
  return [-fz, fx];
};

/** Eén stap: draaien, dan lopen of rijden; schuin gaat niet sneller dan recht, en nooit voorbij de rand. */
export function verkenStap(s: Verkenstand, inv: Invoer, dt: number): Verkenstand {
  const t = tussen(dt, 0, 0.1);
  const kijk = s.kijk + tussen(inv.draai, -1, 1) * DRAAI_PER_S * t;
  const vooruit = tussen(inv.vooruit, -1, 1);
  const opzij = tussen(inv.opzij, -1, 1);
  const n = Math.max(1, Math.hypot(vooruit, opzij));
  const v = (GANGEN[s.gang].snelheid * (inv.snel ? SNEL : 1) * t) / n;
  const [fx, fz] = vooruitVan(kijk);
  const [rx, rz] = rechtsVan(kijk);
  return {
    ...s,
    kijk,
    x: tussen(s.x + (fx * vooruit + rx * opzij) * v, GRENS.x0, GRENS.x1),
    z: tussen(s.z + (fz * vooruit + rz * opzij) * v, GRENS.z0, GRENS.z1),
  };
}

/** Rondkijken door te slepen: naar rechts slepen = naar rechts kijken, omhoog slepen = omhoog kijken. */
export function kijkSlepen(s: Verkenstand, dxPx: number, dyPx: number): Verkenstand {
  return { ...s, kijk: s.kijk - dxPx * 0.005, op: tussen(s.op - dyPx * 0.004, -KIJK_MAX, KIJK_MAX) };
}

/** Beginnen waar de camera nu naar kijkt, met de blik dezelfde kant op. */
export function startStand(camX: number, camZ: number, doelX: number, doelZ: number, gang: Gang): Verkenstand {
  const dx = doelX - camX;
  const dz = doelZ - camZ;
  return {
    x: tussen(doelX, GRENS.x0, GRENS.x1),
    z: tussen(doelZ, GRENS.z0, GRENS.z1),
    kijk: dx === 0 && dz === 0 ? Math.PI : Math.atan2(dx, dz),
    op: 0,
    gang,
  };
}

/** Ooghoogte boven de grond (iets boven de stoep en de weg). */
export const ooghoogte = (s: Verkenstand) => GANGEN[s.gang].oog + 0.15;
