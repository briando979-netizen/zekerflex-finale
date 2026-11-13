import { EXITS, type Pt } from "@/lib/admin/city-layout";

// Nederland rond het live kantoor (13 nov 2026, eigenaar: "ik kan nog steeds niet de hele stad verkennen of wegen zijn
// gebouwd, bouw helemaal uit"): snelwegen van de afritten naar vier steden, een ringweg door elke stad en de panden
// erlangs. Puur bestand: de wereld (geen bomen op de weg), het tekenwerk (components/admin/city/wegen.ts), het verkeer
// en de test gebruiken dezelfde lijnen. Coördinaten zijn [x, z] in meters, zoals in city-layout.ts.

/** De vier steden (midden en de naam op het bord). */
export const STEDEN = [
  { id: "amsterdam", naam: "Amsterdam", x: -430, z: 150 },
  { id: "rotterdam", naam: "Rotterdam", x: -300, z: 430 },
  { id: "utrecht", naam: "Utrecht", x: 300, z: 430 },
  { id: "groningen", naam: "Groningen", x: 430, z: 150 },
] as const;
export type StadId = (typeof STEDEN)[number]["id"];

/** Breedte van een snelweg (twee rijstroken en vluchtstroken) en van een ringweg in de stad. */
export const SNELWEG_B = 8;
export const RING_B = 6;
/** Hier gaat de snelweg langs de afritten (z = ±24) naar het noorden, naar de steden. */
export const AFSLAG_X = 200;
/** Waar het spoor loopt (de twee sporen van het station liggen op z = 116,5 en 119): hier geen panden, wel overwegen. */
export const SPOOR_ZONE: readonly [number, number] = [113.5, 122];

/**
 * Ringweg om het oude centrum, ten opzichte van het midden van de stad. De bekende gebouwen (Westertoren, Erasmusbrug,
 * Dom, Martinitoren) staan erbinnen. In Rotterdam ligt de kant met de grootste z aan de Maas: daar geen panden.
 * Amsterdam en Groningen liggen met de andere kant tegen het spoor (de panden houden er afstand van).
 */
export const RINGEN: Record<StadId, { x0: number; x1: number; z0: number; z1: number; waterKant: boolean }> = {
  amsterdam: { x0: -56, x1: 58, z0: -24, z1: 28, waterKant: false },
  rotterdam: { x0: -58, x1: 52, z0: -42, z1: 0, waterKant: true },
  utrecht: { x0: -48, x1: 44, z0: -28, z1: 30, waterKant: false },
  groningen: { x0: -48, x1: 44, z0: -24, z1: 30, waterKant: false },
};

const stad = (id: StadId) => STEDEN.find((s) => s.id === id) ?? STEDEN[0];

/** De ringweg als gesloten lus (vier hoeken, de eerste herhaald). */
export function ringPunten(id: StadId): Pt[] {
  const s = stad(id);
  const r = RINGEN[id];
  return [
    [s.x + r.x0, s.z + r.z0],
    [s.x + r.x1, s.z + r.z0],
    [s.x + r.x1, s.z + r.z1],
    [s.x + r.x0, s.z + r.z1],
    [s.x + r.x0, s.z + r.z0],
  ];
}

const W = -AFSLAG_X;
const O = AFSLAG_X;
const zW = EXITS.west.z;
const zO = EXITS.oost.z;

/**
 * Elke snelweg één keer (geen dubbele stukken op elkaar): van de afslag naar het noorden, dan naar de rand van de stad.
 * Amsterdam en Rotterdam via de westelijke afslag, Utrecht en Groningen via de oostelijke.
 */
export const SNELWEGEN: { id: string; naar: StadId | null; punten: Pt[] }[] = [
  { id: "w-noord", naar: null, punten: [[W, zW], [W, 150], [W, 410]] },
  { id: "w-amsterdam", naar: "amsterdam", punten: [[W, 150], [stad("amsterdam").x + RINGEN.amsterdam.x1, 150]] },
  { id: "w-rotterdam", naar: "rotterdam", punten: [[W, 410], [stad("rotterdam").x + RINGEN.rotterdam.x1, 410]] },
  { id: "o-noord", naar: null, punten: [[O, zO], [O, 150], [O, 410]] },
  { id: "o-groningen", naar: "groningen", punten: [[O, 150], [stad("groningen").x + RINGEN.groningen.x0, 150]] },
  { id: "o-utrecht", naar: "utrecht", punten: [[O, 410], [stad("utrecht").x + RINGEN.utrecht.x0, 410]] },
];

/** De route die het verkeer rijdt: van de afrit van de stad rond het kantoor naar de ringweg van een stad. */
export const ROUTES: Record<StadId, Pt[]> = {
  amsterdam: [[EXITS.west.x, zW], [W, zW], [W, 150], [stad("amsterdam").x + RINGEN.amsterdam.x1, 150]],
  rotterdam: [[EXITS.west.x, zW], [W, zW], [W, 410], [stad("rotterdam").x + RINGEN.rotterdam.x1, 410]],
  groningen: [[EXITS.oost.x, zO], [O, zO], [O, 150], [stad("groningen").x + RINGEN.groningen.x0, 150]],
  utrecht: [[EXITS.oost.x, zO], [O, zO], [O, 410], [stad("utrecht").x + RINGEN.utrecht.x0, 410]],
};

/** Alle wegstukken (snelwegen en ringen) als losse rechte stukken, met hun breedte. */
export function wegdelen(): { a: Pt; b: Pt; breed: number; snelweg: boolean }[] {
  const uit: { a: Pt; b: Pt; breed: number; snelweg: boolean }[] = [];
  const stukken = (punten: Pt[], breed: number, snelweg: boolean) => {
    for (let i = 1; i < punten.length; i++) {
      const a = punten[i - 1];
      const b = punten[i];
      if (a && b) uit.push({ a, b, breed, snelweg });
    }
  };
  for (const w of SNELWEGEN) stukken(w.punten, SNELWEG_B, true);
  for (const s of STEDEN) stukken(ringPunten(s.id), RING_B, false);
  return uit;
}

/** Afstand van een punt tot het dichtstbijzijnde stuk van een rechte lijn. */
export function afstandTotStuk(x: number, z: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}

const DELEN = wegdelen();
const minAfstand = (x: number, z: number, snelweg: boolean | null) => {
  let min = Infinity;
  for (const d of DELEN) if (snelweg === null || d.snelweg === snelweg) min = Math.min(min, afstandTotStuk(x, z, d.a, d.b));
  return min;
};

/** Hoe ver is dit punt van het midden van de dichtstbijzijnde nieuwe weg (snelweg of ringweg)? */
export const afstandTotWeg = (x: number, z: number) => minAfstand(x, z, null);

/** Waar een weg het spoor kruist: daar komt een overweg met lichten en (bij een trein) wachtende auto's. */
export function overwegen(): Pt[] {
  const midden = (SPOOR_ZONE[0] + SPOOR_ZONE[1]) / 2;
  return DELEN.filter((d) => d.a[0] === d.b[0] && Math.min(d.a[1], d.b[1]) < midden && Math.max(d.a[1], d.b[1]) > midden).map((d) => [d.a[0], midden]);
}

export interface Pand {
  x: number;
  z: number;
  /** breedte langs de straat, diepte van de straat af, hoogte (zonder dak) */
  w: number;
  d: number;
  h: number;
  /** draaiing van het puntdak: 0 = de nok dwars op een straat langs x, π/2 = dwars op een straat langs z */
  ry: number;
  /** puntdak (oude stad) of plat (kantoor, toren) */
  dak: boolean;
  /** glazen toren (Rotterdam) of baksteen */
  glas: boolean;
  /** index in de kleurenlijst van het tekenwerk */
  kleur: number;
}

/** Vaste toevalsreeks per stad: elke keer dezelfde panden. */
function reeks(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * De panden langs de buitenkant van de ringweg, in twee rijen. Amsterdam, Utrecht en Groningen: oude panden met een
 * puntdak (de gevel naar de straat); Rotterdam: vooral glazen torens. Nooit op een weg, op het spoor of in de rivier;
 * de hoeken blijven open (een pleintje), zodat panden van twee kanten niet in elkaar staan.
 */
export function panden(id: StadId): Pand[] {
  const s = stad(id);
  const r = RINGEN[id];
  const rnd = reeks(id.length * 7919 + Math.round(s.x) * 31 + Math.round(s.z));
  const uit: Pand[] = [];
  const zijden: { van: Pt; lengte: number; langsX: boolean; buiten: -1 | 1; water: boolean }[] = [
    { van: [s.x + r.x0, s.z + r.z0], lengte: r.x1 - r.x0, langsX: true, buiten: -1, water: false },
    { van: [s.x + r.x0, s.z + r.z1], lengte: r.x1 - r.x0, langsX: true, buiten: 1, water: r.waterKant },
    { van: [s.x + r.x0, s.z + r.z0], lengte: r.z1 - r.z0, langsX: false, buiten: -1, water: false },
    { van: [s.x + r.x1, s.z + r.z0], lengte: r.z1 - r.z0, langsX: false, buiten: 1, water: false },
  ];
  for (const zijde of zijden) {
    if (zijde.water) continue;
    for (const [rij, afstand] of [[0, 9.5], [1, 22]] as const) {
      for (let t = 5; ; ) {
        const breed = 7 + rnd() * 3;
        const diep = 8 + rnd() * 3;
        if (t + breed > zijde.lengte - 5) break;
        const glas = id === "rotterdam" && rnd() < 0.6;
        const h = glas ? 18 + rnd() * 28 : 9 + rnd() * 5 + (rij === 1 ? 2 : 0);
        const langs = (zijde.langsX ? zijde.van[0] : zijde.van[1]) + t + breed / 2;
        const dwars = (zijde.langsX ? zijde.van[1] : zijde.van[0]) + zijde.buiten * afstand;
        const x = zijde.langsX ? langs : dwars;
        const z = zijde.langsX ? dwars : langs;
        t += breed + 0.4 + (rnd() < 0.15 ? 4 : 0);
        const w = zijde.langsX ? breed : diep;
        const d = zijde.langsX ? diep : breed;
        // niet op een snelweg (die komt hier de stad in), vrij van de ringweg, niet op het spoor
        if (minAfstand(x, z, true) < Math.max(w, d) / 2 + SNELWEG_B / 2 + 1) continue;
        if (minAfstand(x, z, false) < diep / 2 + RING_B / 2 + 0.8) continue;
        if (z + d / 2 > SPOOR_ZONE[0] - 2 && z - d / 2 < SPOOR_ZONE[1] + 2) continue;
        const dak = !glas && (id !== "rotterdam" || rnd() < 0.4);
        uit.push({ x, z, w, d, h, ry: zijde.langsX ? 0 : Math.PI / 2, dak, glas, kleur: Math.floor(rnd() * 8) });
      }
    }
  }
  return uit;
}
