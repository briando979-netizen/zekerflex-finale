import * as THREE from "three";
import { blockRect, CANAL_Z, COMPANY_SLOTS, companyFloors, EXITS, HOUSE_SLOTS, LANDMARKS, type LandmarkId, LINES, type Plot, type Pt, ROAD_W, roadSpan } from "@/lib/admin/city-layout";
import { FRONT_Z, RD, roomCenter, RW } from "@/lib/admin/office3d-layout";
import type { CityCompany } from "@/lib/admin/city-data";
import { bake, gableGeometry, hashOf, type Kit, repeated, seeded, signTexture, type windowTextures } from "@/components/admin/city/parts";
import { ROOMS, type Room, type RoomId } from "@/components/admin/city/rooms";
import { robot, vehicle } from "@/components/admin/city/vehicles";

// De gebouwen en wegen van de 3D-stad. De vaste stad (wegen, park, gracht,
// bank, datacenter, magazijn, opleidingscentrum, hoofdkantoor) wordt één keer
// gebouwd; klantkantoren, huizen en het laadperron zijn lagen die opnieuw
// gebouwd worden als de echte cijfers veranderen. Hoogtes: gras op 0, wegen
// tot ROAD_TOP, stoepen en bouwgrond tot SLAB.

export type Pick = { kind: "room"; id: RoomId } | { kind: "landmark"; id: LandmarkId } | { kind: "woonwijk" } | { kind: "bedrijventerrein" } | { kind: "company"; id: string } | { kind: "kavel" } | { kind: "event"; id: string };

/** Materiaal dat met het dagdeel meegloeit (ramen, lantaarns, schermen). */
export interface Glow {
  m: THREE.MeshStandardMaterial;
  day: number;
  dusk: number;
  night: number;
}

/** Plek voor een naamkaartje boven een gebouw. */
export interface Anchor {
  key: string;
  text: string;
  pos: THREE.Vector3;
  tier: "room" | "landmark" | "company";
}

export interface Layer {
  group: THREE.Group;
  pickables: THREE.Object3D[];
  anchors: Anchor[];
  glows: Glow[];
  dispose: () => void;
}

export interface Staff {
  g: THREE.Group;
  room: Room;
  target: Pt;
  until: number;
  phase: number;
}

type Windows = ReturnType<typeof windowTextures>;

export const ROAD_TOP = 0.06;
export const SLAB = 0.14;
const DISTRICT = SLAB + 0.03;
const PLOT = SLAB + 0.06;

function makeLayer(kit: Kit): Layer {
  const group = new THREE.Group();
  return {
    group,
    pickables: [],
    anchors: [],
    glows: [],
    dispose: () => {
      group.removeFromParent();
      kit.dispose();
    },
  };
}

const pickable = <T extends THREE.Object3D>(L: Layer, obj: T, p: Pick): T => {
  obj.userData.pick = p;
  L.pickables.push(obj);
  return obj;
};

function flat(kit: Kit, w: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const p = new THREE.Mesh(
    kit.geo(`flat:${w}:${d}`, () => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)),
    m,
  );
  p.position.set(x, y, z);
  p.receiveShadow = true;
  return p;
}

/** Bord met tekst, kijkend naar +z (draai de groep voor een andere kant). */
function board(kit: Kit, text: string, w: number, h: number, colors: { bg: string; fg: string }, glow?: Glow[]) {
  const tex = signTexture(kit, text, { ...colors, width: Math.round(256 * (w / h)), height: 256 });
  const m = kit.own({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15, roughness: 0.6 });
  glow?.push({ m, day: 0.15, dusk: 0.55, night: 0.85 });
  const g = new THREE.Group();
  const face = new THREE.Mesh(
    kit.geo(`flat-v:${w}:${h}`, () => new THREE.PlaneGeometry(w, h)),
    m,
  );
  face.position.z = 0.06;
  g.add(face, kit.box(w + 0.1, h + 0.1, 0.1, kit.mat(0x1f2937), 0, 0, 0, false));
  return g;
}

interface Inst {
  x: number;
  y: number;
  z: number;
  sx?: number;
  sy?: number;
  sz?: number;
  rx?: number;
  ry?: number;
  color?: number;
}

/** Veel dezelfde vormen in één keer tekenen (bomen, lantaarns, strepen, huizen). */
function instanced(kit: Kit, geo: THREE.BufferGeometry, m: THREE.Material, items: Inst[], shadow = false) {
  const mesh = kit.track(new THREE.InstancedMesh(geo, m, Math.max(1, items.length)));
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z);
    o.rotation.set(it.rx ?? 0, it.ry ?? 0, 0);
    o.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    if (it.color !== undefined) mesh.setColorAt(i, c.setHex(it.color));
  });
  mesh.count = items.length;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Wegvakken tussen kruispunten (voor strepen, fietspaden, lantaarns en bomen). */
function roadSegments() {
  const out: { axis: "h" | "v"; line: number; a: number; b: number }[] = [];
  const isCross = (v: number) => (LINES as readonly number[]).includes(v);
  for (const axis of ["h", "v"] as const) {
    for (const line of LINES) {
      const [lo, hi] = roadSpan(axis, line);
      const cuts = [lo, ...LINES.filter((c) => c > lo && c < hi), hi];
      for (let k = 0; k < cuts.length - 1; k++) {
        const a = cuts[k] ?? 0;
        const b = cuts[k + 1] ?? 0;
        out.push({ axis, line, a: a + (isCross(a) ? ROAD_W / 2 + 0.3 : 0), b: b - (isCross(b) ? ROAD_W / 2 + 0.3 : 0) });
      }
    }
  }
  return out;
}

const at = (axis: "h" | "v", line: number, s: number, off: number): Pt => (axis === "h" ? [s, line + off] : [line + off, s]);
const near = (p: Pt, list: Pt[], r: number) => list.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < r);
/** Staat dit punt op de stoep (binnen de stad) of op het gras erbuiten? */
const baseAt = (x: number, z: number) => (Math.abs(x) < 74 && Math.abs(z) < 74 ? SLAB : 0);

const DOORS: Pt[] = [...Object.values(LANDMARKS).map((p) => p.door), ...COMPANY_SLOTS.map((p) => p.door)];
const HOUSE_DOORS: Pt[] = HOUSE_SLOTS.map((p) => p.door);

export interface StaticWorld {
  layer: Layer;
  sails: THREE.Object3D;
  fans: THREE.Object3D[];
  coin: THREE.Mesh;
  coinMat: THREE.MeshStandardMaterial;
  leds: THREE.MeshStandardMaterial[];
  antenna: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
}

/** De vaste stad: alles wat niet van de cijfers afhangt. */
export function buildWorld(kit: Kit, win: Windows): StaticWorld {
  const L = makeLayer(kit);
  const G = L.group;
  const rnd = seeded(2026);

  // --- grond, gracht ------------------------------------------------------
  // De grond loopt ver door, zodat hij in de nevel aan de horizon verdwijnt.
  const WIDE = 1200;
  const grass = kit.mat(0x9fcd85, { roughness: 1 });
  const [cz0, cz1] = CANAL_Z;
  G.add(flat(kit, WIDE, cz0 + WIDE / 2, grass, 0, 0, (cz0 - WIDE / 2) / 2), flat(kit, WIDE, WIDE / 2 - cz1, grass, 0, 0, (cz1 + WIDE / 2) / 2));
  const water = kit.own({ color: 0x3d7fb8, roughness: 0.12, metalness: 0.25 });
  G.add(flat(kit, WIDE, cz1 - cz0, water, 0, -0.35, (cz0 + cz1) / 2));
  const quay = kit.mat(0x9a5b43, { roughness: 0.9 });
  G.add(kit.box(WIDE, 0.6, 0.4, quay, 0, -0.18, cz0 + 0.2, false), kit.box(WIDE, 0.6, 0.4, quay, 0, -0.18, cz1 - 0.2, false));
  // woonboten aan de noordkade, in de lengte van de gracht
  for (const [k, x] of [-40, -14, 12, 38, 64].entries()) {
    const hull = kit.mat([0x14532d, 0x1e3a8a, 0x7c2d12, 0x334155, 0x0f766e][k] ?? 0x334155, { roughness: 0.6 });
    G.add(kit.box(8, 0.7, 2.2, hull, x, -0.1, cz0 + 1.6, false));
    G.add(kit.box(5, 1.4, 1.9, kit.mat(0xf1f5f9, { roughness: 0.7 }), x, 0.95, cz0 + 1.6, false));
    G.add(kit.box(5.2, 0.12, 2, kit.mat(0x475569), x, 1.7, cz0 + 1.6, false));
  }

  // --- blokken: stoep rondom, per wijk een eigen ondergrond ----------------
  const sidewalk = kit.mat(0xd7dde5, { roughness: 0.95 });
  const ground: Record<string, number> = { hq: 0xf1f3f6, park: 0x8fcb74, woon: 0x9ed58a, bedrijf: 0xa8d493, west: 0xe9edf2, oost: 0xc9d0d9, opleiding: 0xa8d493 };
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      const r = blockRect(i, j);
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      G.add(kit.box(w + 2, SLAB, d + 2, sidewalk, cx, SLAB / 2, cz, false));
      const kind = j >= 3 ? "woon" : j <= 1 ? "bedrijf" : i === 2 ? "hq" : i === 0 ? "park" : i === 1 ? "west" : i === 3 ? "oost" : "opleiding";
      G.add(flat(kit, w, d, kit.mat(ground[kind] ?? 0xe5e7eb, { roughness: 1 }), cx, DISTRICT, cz));
    }
  }

  // --- wegen met middenstreep, rood fietspad en een zebrapad --------------
  const asphalt = kit.mat(0x394150, { roughness: 0.95 });
  for (const axis of ["h", "v"] as const) {
    for (const line of LINES) {
      const [lo, hi] = roadSpan(axis, line);
      const len = hi - lo + ROAD_W;
      const mid = (lo + hi) / 2;
      const road = axis === "h" ? kit.box(len, ROAD_TOP, ROAD_W, asphalt, mid, ROAD_TOP / 2, line, false) : kit.box(ROAD_W, ROAD_TOP, len, asphalt, line, ROAD_TOP / 2, mid, false);
      G.add(road);
    }
  }
  // de afritten lopen als snelweg door tot in de nevel
  for (const [from, z] of [
    [EXITS.oost.x, EXITS.oost.z],
    [EXITS.west.x, EXITS.west.z],
  ] as const) {
    const to = Math.sign(from) * WIDE * 0.45;
    G.add(kit.box(Math.abs(to - from), ROAD_TOP, ROAD_W + 1, asphalt, (from + to) / 2, ROAD_TOP / 2, z, false));
  }
  const segs = roadSegments();
  const dashes: Inst[] = [];
  const bikes: Inst[] = [];
  const lights: Pt[] = [];
  for (const s of segs) {
    for (let p = s.a + 1; p < s.b - 1; p += 3) {
      const [x, z] = at(s.axis, s.line, p + 0.7, 0);
      dashes.push(s.axis === "h" ? { x, y: ROAD_TOP + 0.03, z, sx: 1.4, sz: 0.14 } : { x, y: ROAD_TOP + 0.03, z, sx: 0.14, sz: 1.4 });
    }
    for (const side of [-1, 1]) {
      const [x, z] = at(s.axis, s.line, (s.a + s.b) / 2, side * 1.7);
      bikes.push(s.axis === "h" ? { x, y: ROAD_TOP + 0.03, z, sx: s.b - s.a, sz: 0.6 } : { x, y: ROAD_TOP + 0.03, z, sx: 0.6, sz: s.b - s.a });
    }
    for (const [f, side] of [
      [0.25, -1],
      [0.75, 1],
    ] as const) {
      const p = at(s.axis, s.line, s.a + (s.b - s.a) * f, side * 2.5);
      if (!near(p, DOORS, 2.6)) lights.push(p);
    }
  }
  for (const vx of LINES) for (const hz of LINES) lights.push([vx + 2.5, hz + 2.5]);
  const unitPlane = kit.geo("unit-flat", () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  G.add(instanced(kit, unitPlane, kit.mat(0xf8fafc, { roughness: 0.6 }), dashes));
  G.add(instanced(kit, unitPlane, kit.mat(0xa4584c, { roughness: 0.95 }), bikes));
  const [hx, hz] = [LANDMARKS.hq.road.x, LANDMARKS.hq.road.z];
  const zebra: Inst[] = [];
  for (let k = -3; k <= 3; k++) zebra.push({ x: hx - 5 + k * 0.9, y: ROAD_TOP + 0.03, z: hz, sx: 0.45, sz: ROAD_W - 0.4 });
  G.add(instanced(kit, unitPlane, kit.mat(0xf8fafc, { roughness: 0.6 }), zebra));

  // --- lantaarns: gloeien als het donker is -------------------------------
  const pole = kit.mat(0x334155, { roughness: 0.5, metalness: 0.4 });
  const bulb = kit.own({ color: 0xfff7e0, emissive: 0xffd58a, emissiveIntensity: 0 });
  L.glows.push({ m: bulb, day: 0, dusk: 1.2, night: 2 });
  G.add(
    instanced(kit, kit.geo("pole", () => new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6)), pole, lights.map(([x, z]) => ({ x, y: baseAt(x, z) + 1.7, z })), true),
    instanced(kit, kit.geo("pole-head", () => new THREE.BoxGeometry(0.5, 0.12, 0.3)), pole, lights.map(([x, z]) => ({ x, y: baseAt(x, z) + 3.45, z }))),
    instanced(kit, kit.geo("bulb", () => new THREE.SphereGeometry(0.17, 10, 8)), bulb, lights.map(([x, z]) => ({ x, y: baseAt(x, z) + 3.3, z }))),
  );

  // --- bomen: langs de stoep, in het park en in een rand om de stad -------
  const trees: Pt[] = [];
  for (const s of segs) {
    for (let p = s.a + 3; p < s.b - 2; p += 6.5) {
      for (const side of [-1, 1]) {
        const q = at(s.axis, s.line, p, side * 2.5);
        if (Math.abs(q[0]) > 74 || near(q, DOORS, 3.4) || near(q, HOUSE_DOORS, 1.3) || near(q, lights, 1.6)) continue;
        trees.push(q);
      }
    }
  }
  const park = blockRect(0, 2);
  for (let z = park.z0 + 1.5; z < park.z1; z += 3.2) trees.push([park.x0 + 1.3, z], [park.x1 - 1.3, z + 1.6]);
  // bos en bomenrijen rond de stad, dichter bij de stad dan verder weg
  for (let n = 0; n < 900; n++) {
    const far = rnd() < 0.35;
    const x = (rnd() - 0.5) * (far ? 480 : 300);
    const z = (far ? -240 : -125) + rnd() * (far ? 420 : 250);
    const inCity = Math.abs(x) < 80 && z > -80 && z < cz0 + 2;
    const inCanal = z > cz0 - 2 && z < cz1 + 2;
    const onExit = (x > 72 && Math.abs(z - 24) < 5) || (x < -72 && Math.abs(z + 24) < 5);
    if (!inCity && !inCanal && !onExit) trees.push([x, z]);
  }
  const trunks: Inst[] = [];
  const crowns: Inst[] = [];
  const greens = [0x3f8f3a, 0x4d9a40, 0x2f7d32, 0x5aa646, 0x6aaa3f];
  for (const [x, z] of trees) {
    const s = 0.8 + rnd() * 0.6;
    const base = baseAt(x, z);
    trunks.push({ x, y: base + 0.6 * s, z, sx: s, sy: s, sz: s });
    crowns.push({ x, y: base + 1.9 * s, z, sx: s, sy: s * 1.15, sz: s, ry: rnd() * 6, color: greens[Math.floor(rnd() * greens.length)] ?? 0x3f8f3a });
  }
  G.add(
    instanced(kit, kit.geo("trunk", () => new THREE.CylinderGeometry(0.12, 0.17, 1.2, 6)), kit.mat(0x7c5a3a), trunks, true),
    instanced(kit, kit.geo("crown", () => new THREE.IcosahedronGeometry(0.95, 0)), kit.mat(0xffffff, { roughness: 0.9, flatShading: true }), crowns, true),
  );

  // --- park met molen, tulpen en een vijver -------------------------------
  const P = LANDMARKS.park;
  const parkGroup = new THREE.Group();
  const millX = P.x;
  const millZ = P.z - 10;
  const wood = kit.mat(0x3d3631, { roughness: 0.85, flatShading: true });
  const brick = kit.mat(0x8f4f3a, { roughness: 0.9, flatShading: true });
  const mill = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(millX, SLAB + y, millZ);
    o.castShadow = o.receiveShadow = true;
    return o;
  };
  parkGroup.add(
    mill(kit.geo("mill-base", () => new THREE.CylinderGeometry(2.7, 3, 1.4, 8)), brick, 0.7),
    mill(kit.geo("mill-body", () => new THREE.CylinderGeometry(1.5, 2.3, 7, 8)), wood, 4.9),
    mill(kit.geo("mill-deck", () => new THREE.CylinderGeometry(3.3, 3.3, 0.16, 8)), kit.mat(0x57534e), 2.6),
    mill(kit.geo("mill-cap", () => new THREE.ConeGeometry(1.75, 2.2, 8)), kit.mat(0x292524, { flatShading: true }), 9.5),
  );
  const sails = new THREE.Group();
  sails.position.set(millX, SLAB + 8.2, millZ + 1.9);
  const sailMat = kit.mat(0xf5efe3, { roughness: 0.8 });
  const spar = kit.mat(0x4b3b2f);
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k * Math.PI) / 2;
    arm.add(kit.box(0.16, 6.2, 0.12, spar, 0, 3.1, 0, false), kit.box(1.1, 5, 0.05, sailMat, 0.62, 3.4, 0.04, false));
    sails.add(arm);
  }
  sails.add(new THREE.Mesh(kit.geo("mill-hub", () => new THREE.SphereGeometry(0.35, 12, 8)), spar));
  sails.userData.live = true;
  parkGroup.add(sails);
  const tulips = [0xe11d48, 0xfacc15, 0xf472b6, 0xfb923c, 0xf8fafc, 0xdc2626];
  tulips.forEach((c, k) => {
    const z = P.z - 2 + k * 1.25;
    parkGroup.add(kit.box(13, 0.12, 0.95, kit.mat(0x3f7f2f), P.x, DISTRICT + 0.06, z, false), kit.box(12.6, 0.18, 0.7, kit.mat(c, { roughness: 0.7 }), P.x, DISTRICT + 0.2, z, false));
  });
  const pond = new THREE.Mesh(
    kit.geo("pond", () => new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)),
    water,
  );
  pond.scale.set(6.3, 1, 4.4);
  pond.position.set(P.x, DISTRICT + 0.02, P.z + 12.5);
  parkGroup.add(pond, flat(kit, P.x + P.w / 2 - millX + 1, 1.4, kit.mat(0xe7dcc4, { roughness: 1 }), (millX + P.x + P.w / 2) / 2, DISTRICT + 0.015, millZ + 3.5));
  pickable(L, parkGroup, { kind: "landmark", id: "park" });
  G.add(parkGroup);
  L.anchors.push({ key: "landmark:park", text: "Park & molen", pos: new THREE.Vector3(millX, 13, millZ), tier: "landmark" });

  // --- ZekerFlex Bank: zuilen, fronton en een draaiende gouden munt -------
  const B = LANDMARKS.bank;
  const bank = new THREE.Group();
  const stone = kit.mat(0xeadfca, { roughness: 0.7 });
  const stoneDark = kit.mat(0xd2c4a6, { roughness: 0.8 });
  const top = SLAB + 0.6;
  bank.add(kit.box(B.w, 0.6, B.d, stoneDark, B.x, SLAB + 0.3, B.z), kit.box(10.4, 5.6, 12.4, stone, B.x - 1.6, top + 2.8, B.z));
  for (let k = 0; k < 6; k++) {
    const col = new THREE.Mesh(
      kit.geo("column", () => new THREE.CylinderGeometry(0.32, 0.38, 4.8, 12)),
      stone,
    );
    col.position.set(B.x + 5.9, top + 2.4, B.z - 5.5 + k * 2.2);
    col.castShadow = col.receiveShadow = true;
    bank.add(col);
  }
  bank.add(kit.box(3, 0.7, 13.2, stone, B.x + 5.3, top + 5.15, B.z));
  const pediment = new THREE.Mesh(
    kit.geo("pediment", () => gableGeometry().rotateY(Math.PI / 2)),
    stoneDark,
  );
  pediment.scale.set(3, 1.8, 13.2);
  pediment.position.set(B.x + 5.3, top + 5.5, B.z);
  pediment.castShadow = true;
  bank.add(pediment, kit.box(0.08, 3, 2.2, kit.mat(0x7c5c22, { roughness: 0.4, metalness: 0.6 }), B.x + 3.62, top + 1.5, B.z));
  const coinMat = kit.own({ color: 0xeab308, emissive: 0xeab308, emissiveIntensity: 0.25, roughness: 0.25, metalness: 0.85 });
  const coin = new THREE.Mesh(
    kit.geo("coin", () => new THREE.CylinderGeometry(1.4, 1.4, 0.28, 40).rotateX(Math.PI / 2)),
    coinMat,
  );
  coin.position.set(B.x - 1.6, top + 8.2, B.z);
  coin.userData.live = true;
  bank.add(coin);
  pickable(L, bank, { kind: "landmark", id: "bank" });
  G.add(bank);
  L.anchors.push({ key: "landmark:bank", text: "ZekerFlex Bank", pos: new THREE.Vector3(B.x, top + 10.4, B.z), tier: "landmark" });

  // --- datacenter: knipperende serverlampjes en draaiende koelers ---------
  const D = LANDMARKS.datacenter;
  const dc = new THREE.Group();
  const dcFace = D.x + D.w / 2 - 1;
  dc.add(kit.box(D.w - 1, 4.4, D.d - 1, kit.mat(0x2b3442, { roughness: 0.6, metalness: 0.25 }), D.x - 0.5, SLAB + 2.2, D.z));
  dc.add(kit.box(0.1, 2.5, 2.6, kit.mat(0x7dd3fc, { roughness: 0.1, metalness: 0.4, emissive: 0x0ea5e9, emissiveIntensity: 0.3 }), dcFace + 0.05, SLAB + 1.25, D.z));
  const ledA = kit.own({ color: 0x0f172a, emissive: 0x22d3ee, emissiveIntensity: 1 });
  const ledB = kit.own({ color: 0x0f172a, emissive: 0x34d399, emissiveIntensity: 1 });
  const leds = [ledA, ledB];
  for (let k = 0; k < 6; k++) {
    const z = D.z - 5 + k * 2;
    if (Math.abs(z - D.z) < 2) continue;
    dc.add(kit.box(0.06, 3.2, 0.32, k % 2 ? ledB : ledA, dcFace + 0.04, SLAB + 2.2, z, false));
  }
  const fans: THREE.Object3D[] = [];
  for (const dz of [-3.2, 0, 3.2]) {
    const housing = new THREE.Mesh(
      kit.geo("fan-housing", () => new THREE.CylinderGeometry(1, 1, 0.6, 18)),
      kit.mat(0x94a3b8, { roughness: 0.5, metalness: 0.4 }),
    );
    housing.position.set(D.x - 2.5, SLAB + 4.7, D.z + dz);
    housing.castShadow = true;
    const fan = new THREE.Group();
    fan.position.set(D.x - 2.5, SLAB + 5.03, D.z + dz);
    fan.add(kit.box(1.7, 0.05, 0.28, kit.mat(0x1f2937), 0, 0, 0, false), kit.box(0.28, 0.05, 1.7, kit.mat(0x1f2937), 0, 0, 0, false));
    fan.userData.live = true;
    fans.push(fan);
    dc.add(housing, fan);
  }
  const antenna = kit.own({ color: 0x7f1d1d, emissive: 0xef4444, emissiveIntensity: 1 });
  const mast = new THREE.Mesh(
    kit.geo("mast", () => new THREE.CylinderGeometry(0.06, 0.1, 5, 6)),
    kit.mat(0x64748b),
  );
  mast.position.set(D.x + 3, SLAB + 6.9, D.z - 3);
  const tip = new THREE.Mesh(kit.geo("mast-tip", () => new THREE.SphereGeometry(0.2, 10, 8)), antenna);
  tip.position.set(D.x + 3, SLAB + 9.5, D.z - 3);
  dc.add(mast, tip);
  pickable(L, dc, { kind: "landmark", id: "datacenter" });
  G.add(dc);
  L.anchors.push({ key: "landmark:datacenter", text: "Datacenter · AI", pos: new THREE.Vector3(D.x, SLAB + 7.5, D.z), tier: "landmark" });

  // --- webshop-magazijn met laadperron -----------------------------------
  const M = LANDMARKS.magazijn;
  const wh = new THREE.Group();
  wh.add(
    kit.box(M.w, 6, M.d, kit.mat(0xd0d7e0, { roughness: 0.75 }), M.x, SLAB + 3, M.z),
    kit.box(M.w + 0.2, 0.7, M.d + 0.2, kit.mat(0xd97706, { roughness: 0.5 }), M.x, SLAB + 5.2, M.z, false),
    kit.box(M.w + 0.6, 0.3, M.d + 0.6, kit.mat(0x8b95a3), M.x, SLAB + 6.15, M.z),
    kit.box(0.1, 2.4, 2.6, kit.mat(0x7dd3fc, { roughness: 0.1, metalness: 0.3 }), M.x - M.w / 2 - 0.05, SLAB + 1.2, M.z, false),
  );
  for (const dx of [-5, 0, 5]) {
    wh.add(kit.box(3.2, 3.4, 0.12, kit.mat(0x94a3b8, { roughness: 0.6, metalness: 0.3 }), M.x + dx, SLAB + 1.7, M.z + M.d / 2 + 0.06, false));
    wh.add(kit.box(3.6, 0.9, 0.9, kit.mat(0x475569), M.x + dx, SLAB + 0.45, M.z + M.d / 2 + 0.45));
  }
  const whSign = board(kit, "Webshop & magazijn", 11, 1.6, { bg: "#d97706", fg: "#ffffff" }, L.glows);
  whSign.position.set(M.x - M.w / 2 - 0.08, SLAB + 4, M.z);
  whSign.rotation.y = -Math.PI / 2;
  wh.add(whSign, flat(kit, M.w, 12, kit.mat(0xb4bcc7, { roughness: 1 }), M.x, PLOT, M.z + M.d / 2 + 6));
  pickable(L, wh, { kind: "landmark", id: "magazijn" });
  G.add(wh);
  L.anchors.push({ key: "landmark:magazijn", text: "Webshop & magazijn", pos: new THREE.Vector3(M.x, SLAB + 8.5, M.z), tier: "landmark" });

  // --- opleidingscentrum (certificaten) en een zonnepark ------------------
  const O = LANDMARKS.opleiding;
  const school = new THREE.Group();
  const facade = kit.own({ color: 0xf5f3ff, map: repeated(kit, win.map, 1.3, 1), emissive: 0xffffff, emissiveMap: repeated(kit, win.lit[1], 1.3, 1), emissiveIntensity: 0, roughness: 0.5 });
  L.glows.push({ m: facade, day: 0, dusk: 0.35, night: 0.85 });
  const roofMat = kit.mat(0x64748b, { roughness: 0.9 });
  const schoolBody = new THREE.Mesh(
    kit.geo(`box:${O.w - 1}:7:${O.d - 1}`, () => new THREE.BoxGeometry(O.w - 1, 7, O.d - 1)),
    [facade, facade, roofMat, roofMat, facade, facade],
  );
  schoolBody.position.set(O.x, SLAB + 3.5, O.z);
  schoolBody.castShadow = schoolBody.receiveShadow = true;
  school.add(schoolBody, kit.box(O.w - 3, 0.35, O.d - 3, kit.mat(0x4d9a40, { roughness: 1 }), O.x, SLAB + 7.17, O.z));
  school.add(kit.box(1.8, 0.2, 4.4, kit.mat(0x7c3aed, { roughness: 0.5 }), O.x - O.w / 2 - 0.4, SLAB + 2.6, O.z, false));
  const schoolSign = board(kit, "Opleidingscentrum", 9, 1.4, { bg: "#7c3aed", fg: "#ffffff" }, L.glows);
  schoolSign.position.set(O.x - O.w / 2 + 0.42, SLAB + 5.6, O.z);
  schoolSign.rotation.y = -Math.PI / 2;
  school.add(schoolSign);
  pickable(L, school, { kind: "landmark", id: "opleiding" });
  G.add(school);
  L.anchors.push({ key: "landmark:opleiding", text: "Opleidingscentrum", pos: new THREE.Vector3(O.x, SLAB + 9.5, O.z), tier: "landmark" });
  const solar = kit.mat(0x1e3a8a, { roughness: 0.25, metalness: 0.6 });
  for (let k = 0; k < 5; k++) {
    const panel = kit.box(14, 0.08, 1.7, solar, O.x, SLAB + 0.75, 7.5 + k * 2.7, false);
    panel.rotation.x = -0.45;
    G.add(panel, kit.box(13, 0.5, 0.12, kit.mat(0x94a3b8), O.x, SLAB + 0.3, 7.5 + k * 2.7, false));
  }

  // --- woonwijk: alleen het naamkaartje (de huizen volgen de cijfers) -----
  // wijknamen staan aan de rand van hun wijk, zodat ze niet over een gebouw vallen
  L.anchors.push({ key: "woonwijk", text: "Woonwijk", pos: new THREE.Vector3(0, 3, 76.5), tier: "landmark" });
  L.anchors.push({ key: "bedrijventerrein", text: "Bedrijventerrein", pos: new THREE.Vector3(0, 3, -76.5), tier: "landmark" });

  // --- afritten: borden naar de rest van Nederland ------------------------
  const exitSign = board(kit, "A10 · rest van Nederland", 7, 1.2, { bg: "#065f46", fg: "#ffffff" });
  exitSign.position.set(90, 3.2, 24 - 3.2);
  exitSign.rotation.y = -Math.PI / 2;
  const exitSignW = board(kit, "A10 · rest van Nederland", 7, 1.2, { bg: "#065f46", fg: "#ffffff" });
  exitSignW.position.set(-90, 3.2, -24 + 3.2);
  exitSignW.rotation.y = Math.PI / 2;
  G.add(exitSign, exitSignW);
  for (const [x, z] of [
    [90, 24 - 3.2],
    [-90, -24 + 3.2],
  ] as const) {
    const post = new THREE.Mesh(kit.geo("pole", () => new THREE.CylinderGeometry(0.07, 0.09, 3.4, 6)), pole);
    post.position.set(x, 1.7, z);
    G.add(post);
  }

  bake(kit, G);
  return { layer: L, sails, fans, coin, coinMat, leds, antenna, water };
}

/** Het hoofdkantoor in het midden: de negen afdelingen uit het oude 3D-kantoor. */
export function buildOffice(kit: Kit, shadow: THREE.Texture) {
  const L = makeLayer(kit);
  const G = L.group;
  G.position.y = SLAB;
  const wallMat = kit.mat(0xffffff, { roughness: 0.6 });
  const staff: Staff[] = [];
  for (const r of ROOMS) {
    const [x, z] = roomCenter(r.cx, r.cy);
    G.add(pickable(L, kit.box(RW, 0.12, RD, kit.mat(r.floor), x, 0.06, z), { kind: "room", id: r.id }));
    // muren rondom, met een deur in het midden van de voorkant
    const h = 1.1;
    const t = 0.18;
    G.add(
      kit.box(RW, h, t, wallMat, x, h / 2, z - RD / 2),
      kit.box(t, h, RD, wallMat, x - RW / 2, h / 2, z),
      kit.box(t, h, RD, wallMat, x + RW / 2, h / 2, z),
      kit.box(RW / 2 - 1, h, t, wallMat, x - RW / 4 - 0.5, h / 2, z + RD / 2),
      kit.box(RW / 2 - 1, h, t, wallMat, x + RW / 4 + 0.5, h / 2, z + RD / 2),
      kit.box(RW, 0.06, t + 0.02, kit.mat(r.accent, { emissive: r.accent, emissiveIntensity: 0.25 }), x, h + 0.03, z - RD / 2, false),
    );
    // bureaus met scherm (het scherm gloeit 's avonds) en een plant
    const screen = kit.own({ color: 0x0f172a, emissive: r.accent, emissiveIntensity: 0.15 });
    L.glows.push({ m: screen, day: 0.15, dusk: 0.6, night: 1.1 });
    for (const dx of [-2.2, 2.2]) {
      G.add(kit.box(2.2, 0.7, 1, kit.mat(0xcbd5e1, { roughness: 0.5 }), x + dx, 0.35, z - 1.4), kit.box(0.9, 0.6, 0.06, screen, x + dx, 1.05, z - 1.75));
    }
    const pot = new THREE.Mesh(kit.geo("pot", () => new THREE.CylinderGeometry(0.25, 0.2, 0.4, 12)), kit.mat(0xa16207));
    pot.position.set(x - RW / 2 + 0.7, 0.2, z - RD / 2 + 0.7);
    const leaves = new THREE.Mesh(kit.geo("leaves", () => new THREE.SphereGeometry(0.45, 12, 10)), kit.mat(0x22c55e));
    leaves.position.set(x - RW / 2 + 0.7, 0.75, z - RD / 2 + 0.7);
    leaves.castShadow = true;
    G.add(pot, leaves);
    // robots die rondlopen in hun eigen afdeling
    for (let i = 0; i < r.staff; i++) {
      const g = robot(kit, r.accent, shadow);
      g.position.set(x + (i ? 2.2 : -2.2), 0.12, z - 0.4);
      G.add(g);
      staff.push({ g, room: r, target: [g.position.x, g.position.z], until: 0, phase: Math.random() * 6 });
    }
    L.anchors.push({ key: `room:${r.id}`, text: r.name, pos: new THREE.Vector3(x, SLAB + 2.2, z - RD / 2), tier: "room" });
  }
  // voorplein: naambord en vlaggen
  const sign = board(kit, "ZekerFlex", 6.5, 1.4, { bg: "#4f6bed", fg: "#ffffff" }, L.glows);
  sign.position.set(-12, 1.1, FRONT_Z + 0.9);
  G.add(sign, kit.box(6.8, 0.4, 0.6, kit.mat(0x94a3b8), -12, 0.2, FRONT_Z + 0.9));
  const flagColors = [
    [0xae1c28, 0xffffff, 0x21468b],
    [0x4f6bed, 0xffffff, 0x4f6bed],
  ];
  flagColors.forEach((stripes, k) => {
    const fx = 10 + k * 2.6;
    const post = new THREE.Mesh(kit.geo("flagpole", () => new THREE.CylinderGeometry(0.05, 0.06, 5.5, 6)), kit.mat(0xe2e8f0, { metalness: 0.5, roughness: 0.4 }));
    post.position.set(fx, 2.75, FRONT_Z + 0.9);
    post.castShadow = true;
    G.add(post);
    stripes.forEach((c, s) => G.add(kit.box(1.6, 0.3, 0.03, kit.mat(c, { roughness: 0.8 }), fx + 0.85, 5.1 - s * 0.3, FRONT_Z + 0.9, false)));
  });
  L.anchors.push({ key: "landmark:hq", text: "Hoofdkantoor", pos: new THREE.Vector3(0, SLAB + 6.5, 0), tier: "landmark" });
  bake(kit, G);
  return { layer: L, staff };
}

const PALETTE = [0xe2e8f0, 0xdbeafe, 0xe0e7ff, 0xfef3c7, 0xdcfce7, 0xfce7f3, 0xede9fe, 0xccfbf1, 0xffedd5];

export interface CompanyLayer {
  layer: Layer;
  /** Plekken in het fietsenrek voor elk pand, voor geparkeerde fietsen. */
  racks: Map<string, Pt[]>;
  /** De giek van de bouwkraan op de eerstvolgende vrije kavel (draait langzaam). */
  crane: THREE.Object3D | null;
}

/**
 * Klantkantoren: elke klant met een pand krijgt een gebouw dat hoger wordt met
 * vestigingen en diensten. Ramen branden 's avonds voller als er nu mensen
 * werken; een groen lampje op het dak betekent open diensten. De eerstvolgende
 * vrije kavel is een bouwplaats.
 */
export function buildCompanies(root: Kit, companies: CityCompany[], win: Windows): CompanyLayer {
  const kit = root.scope();
  const L = makeLayer(kit);
  const G = L.group;
  const racks = new Map<string, Pt[]>();
  let crane: THREE.Object3D | null = null;
  const lot = kit.mat(0xe2e8f0, { roughness: 0.95 });
  const roof = kit.mat(0x64748b, { roughness: 0.9 });
  const beacon = kit.mat(0x22c55e, { emissive: 0x22c55e, emissiveIntensity: 1 });
  for (const [k, slot] of COMPANY_SLOTS.entries()) {
    const c = companies[k];
    G.add(flat(kit, slot.w, slot.d + 3, lot, slot.x, PLOT, slot.z + 1.5));
    if (!c) {
      if (k === companies.length) crane = constructionSite(kit, L, slot);
      else {
        const s = board(kit, "Kavel vrij", 3, 0.9, { bg: "#f8fafc", fg: "#334155" });
        s.position.set(slot.x, SLAB + 1.1, slot.z + slot.d / 2 + 1);
        G.add(pickable(L, s, { kind: "kavel" }));
      }
      continue;
    }
    const floors = companyFloors(c);
    const H = floors * 1.7;
    const bw = slot.w - 2;
    const bd = slot.d - 2;
    const level = c.workingNow > 0 ? 2 : c.openShifts + c.shiftsWeek > 0 ? 1 : 0;
    const side = kit.own({
      color: PALETTE[hashOf(c.name) % PALETTE.length] ?? 0xe2e8f0,
      map: repeated(kit, win.map, bw / 10, floors / 4),
      emissive: 0xffffff,
      emissiveMap: repeated(kit, win.lit[level], bw / 10, floors / 4),
      emissiveIntensity: 0,
      roughness: 0.55,
    });
    L.glows.push({ m: side, day: 0, dusk: 0.35, night: 0.9 });
    const body = new THREE.Mesh(
      kit.geo(`box:${bw}:${H}:${bd}`, () => new THREE.BoxGeometry(bw, H, bd)),
      [side, side, roof, roof, side, side],
    );
    body.position.set(slot.x, SLAB + H / 2, slot.z);
    body.castShadow = body.receiveShadow = true;
    const pand = new THREE.Group();
    pand.add(body, kit.box(bw + 0.24, 0.3, bd + 0.24, roof, slot.x, SLAB + H + 0.15, slot.z));
    const accent = 0x4f6bed;
    pand.add(
      kit.box(3.2, 0.16, 1.4, kit.mat(accent, { roughness: 0.5 }), slot.x, SLAB + 2.5, slot.z + bd / 2 + 0.7, false),
      kit.box(1.8, 2.3, 0.08, kit.mat(0x7dd3fc, { roughness: 0.1, metalness: 0.4 }), slot.x, SLAB + 1.15, slot.z + bd / 2 + 0.04, false),
    );
    const sign = board(kit, c.name, bw - 1.2, 1.3, { bg: "#0f172a", fg: "#ffffff" }, L.glows);
    sign.position.set(slot.x, SLAB + H + 1.15, slot.z + bd / 2 - 0.4);
    pand.add(sign);
    if (c.openShifts > 0) {
      const lamp = new THREE.Mesh(kit.geo("beacon-roof", () => new THREE.SphereGeometry(0.3, 12, 8)), beacon);
      lamp.position.set(slot.x - bw / 2 + 0.8, SLAB + H + 0.6, slot.z - bd / 2 + 0.8);
      pand.add(lamp);
    }
    // fietsenrek voor de deur: hier staan de fietsen van wie er nu werkt
    const rackZ = slot.z + bd / 2 + 2.6;
    pand.add(kit.box(4.6, 0.1, 0.12, kit.mat(0x64748b, { metalness: 0.5, roughness: 0.4 }), slot.x + 3.5, SLAB + 0.45, rackZ, false));
    racks.set(
      c.id,
      Array.from({ length: 8 }, (_, i) => [slot.x + 1.6 + i * 0.55, rackZ] as Pt),
    );
    G.add(pickable(L, pand, { kind: "company", id: c.id }));
    L.anchors.push({ key: `company:${c.id}`, text: c.name, pos: new THREE.Vector3(slot.x, SLAB + H + 2.9, slot.z), tier: "company" });
  }
  bake(kit, G);
  return { layer: L, racks, crane };
}

function constructionSite(kit: Kit, L: Layer, slot: Plot): THREE.Object3D {
  const site = new THREE.Group();
  const fence = kit.mat(0xf97316, { roughness: 0.7 });
  const w = slot.w - 1;
  const d = slot.d - 1;
  site.add(
    kit.box(w, 0.9, 0.08, fence, slot.x, SLAB + 0.45, slot.z - d / 2, false),
    kit.box(w, 0.9, 0.08, fence, slot.x, SLAB + 0.45, slot.z + d / 2, false),
    kit.box(0.08, 0.9, d, fence, slot.x - w / 2, SLAB + 0.45, slot.z, false),
    kit.box(0.08, 0.9, d, fence, slot.x + w / 2, SLAB + 0.45, slot.z, false),
  );
  for (const [dx, dz] of [
    [-3, -3],
    [3, -3],
    [-3, 3],
    [3, 3],
  ] as const)
    site.add(kit.box(0.6, 1.6, 0.6, kit.mat(0x9ca3af), slot.x + dx, SLAB + 0.8, slot.z + dz));
  const yellow = kit.mat(0xfacc15, { roughness: 0.5 });
  const mx = slot.x - w / 2 + 1.2;
  const mz = slot.z - d / 2 + 1.2;
  site.add(kit.box(0.5, 16, 0.5, yellow, mx, SLAB + 8, mz));
  const jib = new THREE.Group();
  jib.position.set(mx, SLAB + 16.2, mz);
  jib.add(kit.box(13, 0.42, 0.42, yellow, 5, 0, 0, false), kit.box(4, 0.42, 0.42, yellow, -2.2, 0, 0, false), kit.box(1.4, 1.1, 0.9, kit.mat(0x6b7280), -3.6, -0.5, 0, false), kit.box(1, 0.9, 1, kit.mat(0x1f2937), 0, -0.7, 0.6, false));
  jib.add(kit.box(0.04, 8, 0.04, kit.mat(0x111827), 8, -4, 0, false), kit.box(1.2, 0.6, 1.2, kit.mat(0x92400e), 8, -8.2, 0, false));
  jib.userData.live = true;
  site.add(jib);
  const sign = board(kit, "Hier komt de volgende klant", 6, 1, { bg: "#f8fafc", fg: "#0f172a" });
  sign.position.set(slot.x + 1.5, SLAB + 1.3, slot.z + d / 2 + 0.1);
  site.add(sign);
  L.group.add(pickable(L, site, { kind: "kavel" }));
  L.anchors.push({ key: "kavel", text: "Bouwkavel · nog vrij", pos: new THREE.Vector3(slot.x, SLAB + 18, slot.z), tier: "company" });
  return jib;
}

const BRICKS = [0x9a4a32, 0x7f3b28, 0xb8664a, 0xc9b79c, 0x6b6f76, 0xe7dcc4, 0x8c5a3c, 0xa16a4f];
const ROOF_COLORS = [0x3f3f46, 0x7c2d12, 0x52525b, 0x9a3412, 0x27272a];
const DOOR_COLORS = [0x14532d, 0x1e3a8a, 0x7f1d1d, 0x111827, 0x0f766e];

/** Woonwijk: één Nederlands huisje per werker, met de puntgevel naar de straat. */
export function buildHouses(root: Kit, n: number): { layer: Layer; built: Plot[] } {
  const kit = root.scope();
  const L = makeLayer(kit);
  const built = HOUSE_SLOTS.slice(0, n);
  const rnd = seeded(31);
  const bodies: Inst[] = [];
  const roofs: Inst[] = [];
  const doors: Inst[] = [];
  const wins: Inst[] = [];
  for (const p of built) {
    const h = 3 + rnd() * 1.6;
    const front = p.road.z < p.z ? -1 : 1;
    const fz = p.z + front * 2.53;
    bodies.push({ x: p.x, y: SLAB + h / 2, z: p.z, sx: 3.6, sy: h, sz: 5, color: BRICKS[Math.floor(rnd() * BRICKS.length)] ?? 0x9a4a32 });
    roofs.push({ x: p.x, y: SLAB + h, z: p.z, sx: 3.9, sy: 1.5 + rnd() * 0.8, sz: 5.3, color: ROOF_COLORS[Math.floor(rnd() * ROOF_COLORS.length)] ?? 0x3f3f46 });
    doors.push({ x: p.x - 0.85, y: SLAB + 0.75, z: fz, sx: 0.75, sy: 1.5, sz: 0.06, color: DOOR_COLORS[Math.floor(rnd() * DOOR_COLORS.length)] ?? 0x14532d });
    wins.push({ x: p.x + 0.75, y: SLAB + 1.15, z: fz, sx: 1.05, sy: 0.95, sz: 0.06 }, { x: p.x - 0.8, y: SLAB + h - 0.85, z: fz, sx: 0.8, sy: 0.85, sz: 0.06 }, { x: p.x + 0.8, y: SLAB + h - 0.85, z: fz, sx: 0.8, sy: 0.85, sz: 0.06 });
  }
  const unit = kit.geo("unit-box", () => new THREE.BoxGeometry(1, 1, 1));
  const winMat = kit.own({ color: 0x334155, emissive: 0xffd27a, emissiveIntensity: 0.05, roughness: 0.3 });
  L.glows.push({ m: winMat, day: 0.05, dusk: 0.55, night: 1 });
  const bodyMesh = instanced(kit, unit, kit.mat(0xffffff, { roughness: 0.85 }), bodies, true);
  const roofMesh = instanced(kit, kit.geo("gable", gableGeometry), kit.mat(0xffffff, { roughness: 0.75, flatShading: true }), roofs, true);
  L.group.add(pickable(L, bodyMesh, { kind: "woonwijk" }), pickable(L, roofMesh, { kind: "woonwijk" }), instanced(kit, unit, kit.mat(0xffffff, { roughness: 0.6 }), doors), instanced(kit, unit, winMat, wins));
  // de eerstvolgende kavel: fundering en een bordje, zoals de bouwkraan bij de klanten
  const next = HOUSE_SLOTS[n];
  if (next) {
    const front = next.road.z < next.z ? -1 : 1;
    const plotGroup = new THREE.Group();
    const sign = board(kit, "Volgende werker", 2.8, 0.7, { bg: "#f8fafc", fg: "#0f172a" });
    sign.position.set(next.x, SLAB + 0.75, next.z + front * 2);
    sign.rotation.y = front < 0 ? Math.PI : 0;
    plotGroup.add(flat(kit, 3.6, 5, kit.mat(0xcbd5e1, { roughness: 1 }), next.x, PLOT, next.z), sign);
    L.group.add(pickable(L, plotGroup, { kind: "woonwijk" }));
  }
  return { layer: L, built };
}

/** Laadperron: bestelbusjes voor wat klaarstaat om te versturen, dozen voor wat vandaag besteld is. */
export function buildDock(root: Kit, toShip: number, ordersToday: number, shadow: THREE.Texture): Layer {
  const kit = root.scope();
  const L = makeLayer(kit);
  const M = LANDMARKS.magazijn;
  for (let k = 0; k < Math.min(3, toShip); k++) {
    const van = vehicle(kit, "bestelbus", shadow).g;
    van.position.set(M.x - 5 + k * 5, PLOT, M.z + M.d / 2 + 3);
    van.rotation.y = Math.PI;
    L.group.add(van);
  }
  const box = kit.mat(0xb07a4a, { roughness: 0.9 });
  for (let k = 0; k < Math.min(12, ordersToday); k++) {
    const col = k % 4;
    const row = Math.floor(k / 4);
    L.group.add(kit.box(0.8, 0.6, 0.8, box, M.x + M.w / 2 - 1.2 - col, PLOT + 0.3 + (row % 2) * 0.62, M.z + M.d / 2 + 8 + Math.floor(row / 2)));
  }
  bake(kit, L.group);
  return L;
}
