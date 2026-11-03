// Leven in de 3D-stad (components/admin/city/life.ts): voetgangers op de stoep,
// mensen op bankjes, honden, eenden, vogels, koeien en schapen in de polder,
// en het echte weer in Amsterdam. Puur rekenwerk zonder three.js, zodat tests
// kunnen bewijzen dat niemand over de weg loopt en dieren in hun wei blijven.
//
// Echt of sfeer: voetgangers in een blauwe ZekerFlex-jas zijn bezoekers die
// nu op zekerflex.com zijn (anoniem, alleen een telling). Andere voetgangers en
// de dieren zijn sfeer en worden zo ook in de uitleg genoemd. Het weer is echt.

import { blockRect, CANAL_Z, LANDMARKS, type Pt, type Rect } from "@/lib/admin/city-layout";

/** Hoe ver van de wegmidden voetgangers lopen: aan de binnenkant van de stoep (stoep = 2 tot 3). */
export const WALK_OFF = 2.9;

/** Rondje over de stoep om blok (i, j), met de klok mee; de hoeken liggen op de stoep, nooit op de weg. */
export function sidewalkLoop(i: number, j: number): Pt[] {
  const r = blockRect(i, j);
  const d = WALK_OFF - 3; // blockRect ligt op 3 van de wegmidden
  const x0 = r.x0 + d;
  const x1 = r.x1 - d;
  const z0 = r.z0 + d;
  const z1 = r.z1 - d;
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
}

/**
 * Hoe druk een blok is: in het centrum (kantoor, woonwijk, bedrijventerrein)
 * lopen meer mensen dan aan de rand. Gewicht voor blok (i, j), (2, 2) is het kantoor.
 */
export function blockWeight(i: number, j: number): number {
  const d = Math.abs(i - 2) + Math.abs(j - 2);
  return d === 0 ? 4 : d === 1 ? 3 : d === 2 ? 1.5 : 0.7;
}

/** Kies een blok naar drukte; `r` is een toevalsgetal tussen 0 en 1. */
export function pickBlock(r: number): [number, number] {
  const all: [number, number, number][] = [];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) all.push([i, j, blockWeight(i, j)]);
  const total = all.reduce((s, b) => s + b[2], 0);
  let left = r * total;
  for (const [i, j, w] of all) {
    left -= w;
    if (left <= 0) return [i, j];
  }
  return [2, 2];
}

/** Punt op een gesloten rondje bij fractie t (0..1), met de looprichting. */
export function alongLoop(loop: Pt[], t: number): { at: Pt; dir: Pt } {
  const segs = loop.map((a, k) => {
    const b = loop[(k + 1) % loop.length] as Pt;
    return { a, b, len: Math.hypot(b[0] - a[0], b[1] - a[1]) };
  });
  const total = segs.reduce((s, x) => s + x.len, 0) || 1;
  let rest = (((t % 1) + 1) % 1) * total;
  for (const s of segs) {
    if (rest <= s.len || s === segs[segs.length - 1]) {
      const k = s.len ? Math.min(1, rest / s.len) : 0;
      const dir: Pt = s.len ? [(s.b[0] - s.a[0]) / s.len, (s.b[1] - s.a[1]) / s.len] : [1, 0];
      return { at: [s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k], dir };
    }
    rest -= s.len;
  }
  return { at: loop[0] ?? [0, 0], dir: [1, 0] };
}

/** Lengte van een gesloten rondje. */
export function loopLength(loop: Pt[]): number {
  return loop.reduce((s, a, k) => {
    const b = loop[(k + 1) % loop.length] as Pt;
    return s + Math.hypot(b[0] - a[0], b[1] - a[1]);
  }, 0);
}

export type Phase = "dag" | "schemer" | "nacht";

/**
 * Hoeveel voetgangers er lopen. Bezoekers (echt) tellen altijd mee, tot een
 * plafond; daarbij komen bewoners (sfeer): overdag druk, 's avonds rustiger,
 * 's nachts bijna niemand, en bij regen of onweer minder.
 */
export function crowdSize(phase: Phase, visitors: number, weather: WeatherKind): { visitors: number; residents: number } {
  const base = phase === "dag" ? 60 : phase === "schemer" ? 30 : 8;
  const wet = weather === "regen" || weather === "onweer" ? 0.45 : weather === "sneeuw" ? 0.6 : 1;
  return { visitors: Math.max(0, Math.min(40, Math.floor(visitors))), residents: Math.round(base * wet) };
}

// --- weer ---------------------------------------------------------------

export type WeatherKind = "helder" | "bewolkt" | "mist" | "motregen" | "regen" | "sneeuw" | "onweer";

/**
 * Weersymbool van MET Norway (locationforecast, bv. "lightrain", "partlycloudy_day",
 * "heavyrainandthunder") naar een soort weer in de stad.
 */
export function weatherKind(symbol: string, cloudCover = 0): WeatherKind {
  const s = symbol.toLowerCase();
  if (s.includes("thunder")) return "onweer";
  if (s.includes("snow") || s.includes("sleet")) return "sneeuw";
  if (s.startsWith("lightrain")) return "motregen";
  if (s.includes("rain")) return "regen";
  if (s.includes("fog")) return "mist";
  if (s.startsWith("cloudy") || (s.startsWith("partlycloudy") && cloudCover >= 60)) return "bewolkt";
  return "helder";
}

export const WEATHER_NL: Record<WeatherKind, string> = {
  helder: "helder",
  bewolkt: "bewolkt",
  mist: "mist",
  motregen: "motregen",
  regen: "regen",
  sneeuw: "sneeuw",
  onweer: "onweer",
};

/** Regendruppels of sneeuwvlokken in beeld bij dit weer (0 = geen). */
export function precipitationAmount(kind: WeatherKind, mmPerHour = 0): number {
  if (kind === "onweer") return 1600;
  if (kind === "regen") return Math.round(700 + Math.min(900, mmPerHour * 300));
  if (kind === "motregen") return 420;
  if (kind === "sneeuw") return 1100;
  return 0;
}

// --- plekken voor bankjes en dieren -------------------------------------

export interface Bench {
  x: number;
  z: number;
  /** Kijkrichting (rotation.y): 0 = naar +z (zuid), π/2 = naar +x (oost). */
  ry: number;
}

const park = LANDMARKS.park;
const garden = (i: number, j: number) => {
  const r = blockRect(i, j);
  return (r.z0 + r.z1) / 2;
};

/** Bankjes: in het park, op het kantoorplein en in de tuinen van de woonwijk. */
export const BENCHES: Bench[] = [
  { x: park.x + park.w / 2 - 3.2, z: -17, ry: -Math.PI / 2 },
  { x: park.x + park.w / 2 - 3.2, z: -4.6, ry: -Math.PI / 2 },
  { x: park.x + park.w / 2 - 3.2, z: 6.5, ry: -Math.PI / 2 },
  { x: -18.5, z: 18.6, ry: 0 },
  { x: 17.5, z: 18.6, ry: 0 },
  { x: -12, z: garden(2, 3), ry: 0 },
  { x: 0, z: garden(2, 3), ry: Math.PI },
  { x: 12, z: garden(2, 3), ry: 0 },
  { x: -60, z: garden(0, 3), ry: 0 },
  { x: 60, z: garden(4, 3), ry: Math.PI },
];

/** Polder achter het bedrijventerrein: koeien in het westen, schapen in het oosten, sloten ertussen. */
export const MEADOW_COWS: Rect = { x0: -104, x1: -22, z0: -128, z1: -90 };
export const MEADOW_SHEEP: Rect = { x0: 22, x1: 104, z0: -128, z1: -90 };
/** Sloten langs de weilanden (smalle waterstroken). */
export const DITCHES: Rect[] = [
  { x0: -108, x1: 108, z0: -87, z1: -86 },
  { x0: -108, x1: 108, z0: -132, z1: -131 },
  { x0: -19, x1: -18, z0: -131, z1: -87 },
  { x0: 18, x1: 19, z0: -131, z1: -87 },
];
/** De boerderij tussen de twee weilanden. */
export const FARM: Pt = [0, -110];

/** Water voor eenden: de vijver in het park en de gracht. */
export const POND = { x: park.x, z: park.z + 12.5, rx: 6.3, rz: 4.4 };
export const CANAL_WATER: Rect = { x0: -120, x1: 120, z0: CANAL_Z[0] + 3.4, z1: CANAL_Z[1] - 0.8 };

export const inRect = (r: Rect, x: number, z: number, pad = 0) => x >= r.x0 + pad && x <= r.x1 - pad && z >= r.z0 + pad && z <= r.z1 - pad;
export const inPond = (x: number, z: number, pad = 0) => ((x - POND.x) / (POND.rx - pad)) ** 2 + ((z - POND.z) / (POND.rz - pad)) ** 2 <= 1;

/** Houd een dier binnen zijn gebied: stuurt terug naar het midden als het de rand nadert. */
export function steerInside(r: Rect, x: number, z: number, heading: number, pad = 2): number {
  if (inRect(r, x, z, pad)) return heading;
  return Math.atan2((r.x0 + r.x1) / 2 - x, (r.z0 + r.z1) / 2 - z);
}
