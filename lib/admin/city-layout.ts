// Stad rond het 3D-kantoor (components/admin/Office3D.tsx). Het hoofdkantoor
// staat in het midden; daaromheen ligt een raster van wegen met gebouwen die op
// echte cijfers draaien: klantkantoren op het bedrijventerrein (noord), de bank
// en het datacenter (west), het magazijn en het opleidingscentrum (oost), de
// woonwijk (zuid) en een park met molen. Voertuigen rijden alleen over wegen,
// rechts van de middenstreep; fietsers rijden op het fietspad aan de rand.
// Alles hier is puur rekenwerk zonder three.js, zodat tests het kunnen bewijzen.

export const ROAD_W = 4;
/** Wegen: verticaal op x = L, horizontaal op z = L. Door het midden loopt geen weg, daar staat het kantoor. */
export const LINES = [-72, -48, -24, 24, 48, 72] as const;
export const CITY_EDGE = 72;
/** Afritten naar de rest van Nederland: z = 24 loopt door naar het oosten, z = -24 naar het westen. */
export const EXIT_X = 112;
/** Gracht langs de zuidrand, voorbij de laatste weg. */
export const CANAL_Z: readonly [number, number] = [79, 87];
/** Afstand van de wegmidden: auto's rijden rechts, fietsers op het fietspad. */
export const LANE_CAR = 1;
export const LANE_BIKE = 1.7;

export type Pt = [number, number];
export interface RoadPt {
  x: number;
  z: number;
  /** "h" = op een horizontale weg (z vast), "v" = op een verticale weg (x vast). */
  axis: "h" | "v";
}
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export interface Plot {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Net buiten de gevel, waar voertuigen stoppen. */
  door: Pt;
  /** Het punt op de wegmidden recht voor de deur. */
  road: RoadPt;
}

const SPANS: [number, number][] = [
  [-72, -48],
  [-48, -24],
  [-24, 24],
  [24, 48],
  [48, 72],
];
/** Halve weg plus stoep: zo ver blijft alles in een blok van de wegmidden af. */
export const BLOCK_MARGIN = ROAD_W / 2 + 1;

/** Bouwgrond van blok (i, j); kolom i en rij j lopen van 0 (west/noord) tot 4 (oost/zuid), (2, 2) is het kantoor. */
export function blockRect(i: number, j: number): Rect {
  const [x0, x1] = SPANS[i] ?? [0, 0];
  const [z0, z1] = SPANS[j] ?? [0, 0];
  return { x0: x0 + BLOCK_MARGIN, x1: x1 - BLOCK_MARGIN, z0: z0 + BLOCK_MARGIN, z1: z1 - BLOCK_MARGIN };
}

/** Lengte van elke weg: z = 24 en z = -24 lopen door tot de afritten. */
export function roadSpan(axis: "h" | "v", line: number): [number, number] {
  if (axis === "h" && line === 24) return [-CITY_EDGE, EXIT_X];
  if (axis === "h" && line === -24) return [-EXIT_X, CITY_EDGE];
  return [-CITY_EDGE, CITY_EDGE];
}

const nextLine = (v: number) => LINES.find((l) => l > v) ?? CITY_EDGE;
const prevLine = (v: number) => [...LINES].reverse().find((l) => l < v) ?? -CITY_EDGE;

/** Kavel met de deur aan één kant en het punt op de weg daarvoor. */
export function plot(x: number, z: number, w: number, d: number, side: "n" | "s" | "e" | "w"): Plot {
  const p = { x, z, w, d };
  if (side === "s") return { ...p, door: [x, z + d / 2 + 0.6], road: { x, z: nextLine(z + d / 2), axis: "h" } };
  if (side === "n") return { ...p, door: [x, z - d / 2 - 0.6], road: { x, z: prevLine(z - d / 2), axis: "h" } };
  if (side === "e") return { ...p, door: [x + w / 2 + 0.6, z], road: { x: nextLine(x + w / 2), z, axis: "v" } };
  return { ...p, door: [x - w / 2 - 0.6, z], road: { x: prevLine(x - w / 2), z, axis: "v" } };
}

// --- vaste gebouwen -------------------------------------------------------

export type LandmarkId = "hq" | "bank" | "datacenter" | "magazijn" | "opleiding" | "park";

export const LANDMARKS: Record<LandmarkId, Plot> = {
  // Het kantoorplein is het hele middenblok; de voordeur kijkt naar de weg op z = 24.
  hq: { x: 0, z: 0, w: 42, d: 42, door: [0, 22.4], road: { x: 0, z: 24, axis: "h" } },
  bank: plot(-36, -10, 14, 14, "e"),
  datacenter: plot(-36, 11, 14, 12, "e"),
  magazijn: plot(36, -5, 16, 24, "w"),
  opleiding: plot(60, -6, 14, 16, "w"),
  park: plot(-60, 0, 18, 42, "e"),
};

/** Afritten: hier komen post en nieuwe leads de stad in, en vertrekken bestellingen. */
export const EXITS = {
  oost: { x: EXIT_X, z: 24, axis: "h" },
  west: { x: -EXIT_X, z: -24, axis: "h" },
} as const satisfies Record<string, RoadPt>;

/**
 * Kavels voor klantkantoren op het bedrijventerrein, de dichtstbijzijnde eerst:
 * de drukste klant krijgt het pand recht tegenover het hoofdkantoor.
 */
export const COMPANY_SLOTS: Plot[] = (() => {
  const slot = (i: number, j: number, dx = 0) => {
    const r = blockRect(i, j);
    const wide = i === 2;
    return plot((r.x0 + r.x1) / 2 + dx, (r.z0 + r.z1) / 2, wide ? 14 : 12, 12, "s");
  };
  return [slot(2, 1, -10.5), slot(2, 1, 10.5), slot(1, 1), slot(3, 1), slot(2, 0, -10.5), slot(2, 0, 10.5), slot(0, 1), slot(4, 1), slot(1, 0), slot(3, 0), slot(0, 0), slot(4, 0)];
})();

/** Huizen in de woonwijk (twee rijen per blok), het dichtst bij het kantoor eerst. */
export const HOUSE_SLOTS: Plot[] = (() => {
  const out: Plot[] = [];
  for (const j of [3, 4]) {
    for (let i = 0; i < 5; i++) {
      const r = blockRect(i, j);
      const n = i === 2 ? 9 : 4;
      const w = 4;
      const gap = (r.x1 - r.x0 - n * w) / (n - 1);
      for (let k = 0; k < n; k++) {
        const x = r.x0 + w / 2 + k * (w + gap);
        out.push(plot(round(x), r.z0 + 3, w, 6, "n"), plot(round(x), r.z1 - 3, w, 6, "s"));
      }
    }
  }
  const [hx, hz] = LANDMARKS.hq.door;
  return out.sort((a, b) => Math.hypot(a.x - hx, a.z - hz) - Math.hypot(b.x - hx, b.z - hz));
})();

function round(v: number) {
  return Math.round(v * 100) / 100;
}

// --- routes ---------------------------------------------------------------

/** De verbindingsweg tussen a en b die de kortste omweg geeft (bij gelijk: die het dichtst bij b ligt). */
function bestLine(a: number, b: number): number {
  let best: number = LINES[0];
  let cost = Infinity;
  for (const l of LINES) {
    const c = Math.abs(a - l) + Math.abs(l - b) + Math.abs(l - b) * 1e-6;
    if (c < cost) {
      cost = c;
      best = l;
    }
  }
  return best;
}

/** Route over de wegmiddens van a naar b; elk stuk ligt op één weg. */
export function roadRoute(a: RoadPt, b: RoadPt): Pt[] {
  let pts: Pt[];
  if (a.axis === "h" && b.axis === "h") {
    const v = bestLine(a.x, b.x);
    pts = a.z === b.z ? [[a.x, a.z], [b.x, b.z]] : [[a.x, a.z], [v, a.z], [v, b.z], [b.x, b.z]];
  } else if (a.axis === "v" && b.axis === "v") {
    const h = bestLine(a.z, b.z);
    pts = a.x === b.x ? [[a.x, a.z], [b.x, b.z]] : [[a.x, a.z], [a.x, h], [b.x, h], [b.x, b.z]];
  } else if (a.axis === "h") {
    pts = [[a.x, a.z], [b.x, a.z], [b.x, b.z]];
  } else {
    pts = [[a.x, a.z], [a.x, b.z], [b.x, b.z]];
  }
  return dedupe(pts);
}

/** Volledige rit van deur tot deur, over de wegmidden (nog zonder rijstrook). */
export function tripCenter(from: { door?: Pt; road: RoadPt }, to: { door?: Pt; road: RoadPt }): Pt[] {
  return dedupe([...(from.door ? [from.door] : []), ...roadRoute(from.road, to.road), ...(to.door ? [to.door] : [])]);
}

function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-9 || Math.abs(last[1] - p[1]) > 1e-9) out.push(p);
  }
  return out;
}

/**
 * Schuif een route `off` naar rechts (rechts rijden). Werkt voor routes met
 * alleen rechte stukken langs x of z; in een bocht snijden de verschoven
 * stukken elkaar precies in de hoek.
 */
export function laneOffset(path: Pt[], off: number): Pt[] {
  if (path.length < 2) return path.map((p) => [p[0], p[1]]);
  const normals: Pt[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i] as Pt;
    const b = path[i + 1] as Pt;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    // rechts van rijrichting (dx, dz) is (-dz, dx): naar het noorden (-z) rijden geeft +x
    normals.push([-(b[1] - a[1]) / len, (b[0] - a[0]) / len]);
  }
  return path.map((p, i) => {
    const before = normals[i - 1];
    const after = normals[i];
    if (!before && after) return [p[0] + after[0] * off, p[1] + after[1] * off];
    if (before && !after) return [p[0] + before[0] * off, p[1] + before[1] * off];
    if (!before || !after) return [p[0], p[1]];
    const same = Math.abs(before[0] - after[0]) < 1e-9 && Math.abs(before[1] - after[1]) < 1e-9;
    return same ? [p[0] + after[0] * off, p[1] + after[1] * off] : [p[0] + (before[0] + after[0]) * off, p[1] + (before[1] + after[1]) * off];
  });
}

/** Lengte van een route in wereldeenheden. */
export function pathLength(path: Pt[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Pt;
    const b = path[i] as Pt;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}

// --- welke gebeurtenis rijdt waarvandaan ---------------------------------

export type Origin = Exclude<LandmarkId, "hq" | "park"> | "woonwijk" | keyof typeof EXITS | `bedrijf:${string}`;
export type VehicleKind = "bus" | "bestelbus" | "geldwagen" | "postauto" | "auto" | "stroomauto";

/**
 * Elke echte gebeurtenis rijdt van waar hij vandaan komt naar het hoofdkantoor;
 * daar brengt een koerier hem naar de afdeling. Een gebeurtenis van een klant
 * met een eigen pand vertrekt uit dat pand.
 */
export function trafficFor(ev: { room: string; action: string; tenantId?: string | null | undefined }, companies: ReadonlySet<string>): { from: Origin; kind: VehicleKind } {
  const company: Origin | null = ev.tenantId && companies.has(ev.tenantId) ? `bedrijf:${ev.tenantId}` : null;
  switch (ev.room) {
    case "shop":
      return { from: "magazijn", kind: "bestelbus" };
    case "bank":
      return { from: "bank", kind: "geldwagen" };
    case "finance":
      return { from: company ?? "bank", kind: "geldwagen" };
    case "support":
      return { from: "oost", kind: "postauto" };
    case "sales":
      return { from: company ?? "west", kind: "auto" };
    case "operations":
      return { from: company ?? "woonwijk", kind: "bus" };
    case "legal":
      if (ev.action.startsWith("kyc.")) return { from: "woonwijk", kind: "auto" };
      if (ev.action.startsWith("certificate")) return { from: "opleiding", kind: "auto" };
      return { from: company ?? "west", kind: "auto" };
    case "ai":
      return { from: "datacenter", kind: "stroomauto" };
    default:
      return { from: company ?? "oost", kind: "auto" };
  }
}

/** Huizen in de woonwijk: één per werker, met een plafond van het aantal kavels. */
export function houseCount(workers: number): number {
  return Math.max(0, Math.min(HOUSE_SLOTS.length, Math.floor(workers)));
}

/** Verdiepingen van een klantkantoor: groeit met vestigingen en diensten, 2 tot 9 hoog. */
export function companyFloors(c: { branches: number; openShifts: number; shiftsWeek: number }): number {
  return Math.max(2, Math.min(9, 2 + c.branches + Math.ceil((c.openShifts + c.shiftsWeek) / 3)));
}

/** Molen: draait sneller als er meer gebeurt (gebeurtenissen in het laatste uur), nooit stil. */
export function millSpeed(eventsLastHour: number): number {
  return 0.25 + Math.min(2.5, Math.sqrt(Math.max(0, eventsLastHour)) * 0.35);
}

const LAT = (52.37 * Math.PI) / 180;
const LON = 4.9;

/**
 * Echte zonnestand boven Amsterdam op dit moment (op ±15 minuten, zonder
 * tijdzone: alles in UTC). `elevation` in radialen (negatief = onder de
 * horizon); `dir` is de richting naar de zon in het grondvlak, met +x = oost
 * en +z = zuid, zoals in de stad.
 */
export function sunAt(d: Date): { elevation: number; dir: Pt } {
  const dayOfYear = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000;
  const decl = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (284 + dayOfYear)) / 365);
  const solarHours = d.getUTCHours() + d.getUTCMinutes() / 60 + LON / 15;
  const ha = ((solarHours - 12) * 15 * Math.PI) / 180;
  const elevation = Math.asin(Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(ha));
  // azimut vanaf het zuiden, positief richting west
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(LAT) - Math.tan(decl) * Math.cos(LAT));
  return { elevation, dir: [-Math.sin(az), Math.cos(az)] };
}

/** Dagdeel uit de zonnestand: schemering tussen 6° onder en 6° boven de horizon. */
export function dayPhase(elevation: number): "dag" | "schemer" | "nacht" {
  const deg = (elevation * 180) / Math.PI;
  return deg > 6 ? "dag" : deg > -6 ? "schemer" : "nacht";
}
