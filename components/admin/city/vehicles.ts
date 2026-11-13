import * as THREE from "three";
import type { Pt, VehicleKind } from "@/lib/admin/city-layout";
import { bake, type Kit } from "@/components/admin/city/parts";
import { asAfstand, type AutoMaten, autoMaten, glasVorm, rompVorm, velgVorm } from "@/components/admin/city/vormen";

// Alles wat beweegt in de stad: robots in het kantoor, voertuigen met een
// echte gebeurtenis, gewoon verkeer, fietsers en rondvaartboten. Voorkant =
// +z, zodat rotation.y = atan2(dx, dz) ze in de rijrichting zet. Bewegende
// dingen werpen geen echte schaduw (die wordt maar af en toe opnieuw berekend)
// maar krijgen een zachte vlek eronder.

const blobMats = new WeakMap<Kit, THREE.MeshBasicMaterial>();

export function blob(kit: Kit, tex: THREE.Texture, w: number, d: number) {
  let m = blobMats.get(kit);
  if (!m) {
    m = kit.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    blobMats.set(kit, m);
  }
  const mesh = new THREE.Mesh(
    kit.geo("blob", () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)),
    m,
  );
  mesh.scale.set(w, 1, d);
  mesh.position.y = 0.02;
  mesh.renderOrder = 1;
  return mesh;
}

/** Robotje zoals in het oude kantoor: capsule, kop en een lichtgevend vizier. */
export function robot(kit: Kit, color: number, shadow: THREE.Texture, scale = 1) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    kit.geo(`robot-body:${scale}`, () => new THREE.CapsuleGeometry(0.32 * scale, 0.5 * scale, 4, 12)),
    kit.mat(color, { roughness: 0.45 }),
  );
  body.position.y = 0.62 * scale;
  const head = new THREE.Mesh(
    kit.geo(`robot-head:${scale}`, () => new THREE.SphereGeometry(0.28 * scale, 16, 12)),
    kit.mat(0xffffff, { roughness: 0.3 }),
  );
  head.position.y = 1.25 * scale;
  const visor = kit.box(0.34 * scale, 0.1 * scale, 0.06 * scale, kit.mat(0x0f172a, { emissive: 0x38bdf8, emissiveIntensity: 0.8 }), 0, 1.27 * scale, 0.25 * scale, false);
  g.add(body, head, visor, blob(kit, shadow, 0.9 * scale, 0.9 * scale));
  g.userData.live = true;
  return g;
}

// Elk soort voertuig (of fiets) wordt één keer gebouwd en samengevoegd; daarna
// zijn het kopieën die dezelfde vormen en materialen delen.
const protos = new WeakMap<Kit, Map<string, THREE.Object3D>>();
function cached(kit: Kit, key: string, make: () => THREE.Group): THREE.Object3D {
  let map = protos.get(kit);
  if (!map) {
    map = new Map();
    protos.set(kit, map);
  }
  let proto = map.get(key);
  if (!proto) {
    const g = make();
    bake(kit, g);
    proto = g;
    map.set(key, proto);
  }
  const copy = proto.clone();
  copy.userData.live = true;
  return copy;
}

const wheel = (kit: Kit, x: number, z: number, r = 0.26) => {
  const w = new THREE.Mesh(
    kit.geo(`wheel:${r}`, () => new THREE.CylinderGeometry(r, r, 0.18, 14).rotateZ(Math.PI / 2)),
    kit.mat(0x111827, { roughness: 0.9 }),
  );
  w.position.set(x, r, z);
  return w;
};

const LOOK: Record<VehicleKind | "verkeer", { body: number; stripe?: number; len: number; wid: number; hgt: number; cabin: "car" | "van" | "bus" }> = {
  bus: { body: 0x16a34a, stripe: 0xffffff, len: 4.4, wid: 1.4, hgt: 1.5, cabin: "bus" },
  bestelbus: { body: 0xf8fafc, stripe: 0xd97706, len: 2.6, wid: 1.25, hgt: 1.35, cabin: "van" },
  geldwagen: { body: 0x334155, stripe: 0xeab308, len: 2.6, wid: 1.3, hgt: 1.3, cabin: "van" },
  postauto: { body: 0x0284c7, stripe: 0xffffff, len: 2.4, wid: 1.2, hgt: 1.3, cabin: "van" },
  auto: { body: 0x8b5cf6, len: 2.1, wid: 1.1, hgt: 0.55, cabin: "car" },
  stroomauto: { body: 0xf8fafc, stripe: 0x4f6bed, len: 2.0, wid: 1.05, hgt: 0.5, cabin: "car" },
  verkeer: { body: 0x94a3b8, len: 2.1, wid: 1.1, hgt: 0.55, cabin: "car" },
};

type Look = (typeof LOOK)[keyof typeof LOOK];

export const TRAFFIC_COLORS = [0x94a3b8, 0xcbd5e1, 0x64748b, 0x1f2937, 0xe5e7eb, 0x9ca3af, 0x7f1d1d, 0x1e3a8a];

/**
 * Voertuig in de stijl van zijn soort. Bij een waarschuwing of iets kritieks
 * draait er een zwaailicht op het dak (oranje of rood).
 */
export function vehicle(kit: Kit, kind: VehicleKind | "verkeer", shadow: THREE.Texture, opts: { color?: number; severity?: string } = {}) {
  const alarm = opts.severity === "critical" || opts.severity === "warning" ? opts.severity : "";
  const g = cached(kit, `${kind}|${opts.color ?? ""}|${alarm}`, () => buildVehicle(kit, kind, shadow, opts.color, alarm));
  return { g };
}

function buildVehicle(kit: Kit, kind: VehicleKind | "verkeer", shadow: THREE.Texture, color: number | undefined, alarm: string) {
  const look = LOOK[kind];
  const opts = { color, severity: alarm };
  const g = new THREE.Group();
  const bodyMat = kit.mat(opts.color ?? look.body, { roughness: 0.35, metalness: 0.15 });
  const glass = kit.mat(0x1e293b, { roughness: 0.15, metalness: 0.4 });
  const { len, wid, hgt } = look;
  const base = 0.32;
  // realistisch: een carrosserie uit één profiel met wielkasten, schuine ruiten en velgen (vormen.ts)
  const maten = kit.echt ? autoMaten(look.cabin, hgt) : null;
  if (maten) echteCarrosserie(kit, g, look, bodyMat, glass, maten);
  else if (look.cabin === "car") {
    g.add(kit.box(wid, hgt, len, bodyMat, 0, base + hgt / 2, 0, false));
    g.add(kit.box(wid * 0.86, 0.42, len * 0.5, glass, 0, base + hgt + 0.21, -len * 0.05, false));
  } else if (look.cabin === "van") {
    g.add(kit.box(wid, hgt, len * 0.72, bodyMat, 0, base + hgt / 2, -len * 0.14, false));
    g.add(kit.box(wid, hgt * 0.72, len * 0.28, bodyMat, 0, base + (hgt * 0.72) / 2, len * 0.36, false));
    g.add(kit.box(wid * 0.9, hgt * 0.3, 0.05, glass, 0, base + hgt * 0.55, len * 0.5 + 0.01, false));
  } else {
    g.add(kit.box(wid, hgt, len, bodyMat, 0, base + hgt / 2, 0, false));
    g.add(kit.box(wid + 0.02, hgt * 0.32, len * 0.86, glass, 0, base + hgt * 0.66, 0, false));
  }
  // bij een echte auto boven de wielkasten, anders loopt de streep over het wiel heen
  const streepY = maten && look.cabin === "car" ? 0.7 : base + hgt * 0.32;
  if (look.stripe !== undefined) g.add(kit.box(wid + 0.03, 0.14, len * (look.cabin === "bus" ? 0.98 : 0.7), kit.mat(look.stripe, { roughness: 0.5 }), 0, streepY, look.cabin === "van" ? -len * 0.14 : 0, false));
  // koplampen en achterlichten (gloeien altijd een beetje, 's nachts het best te zien)
  const head = kit.mat(0xfff7d6, { emissive: 0xfff2c2, emissiveIntensity: 0.9 });
  const tail = kit.mat(0x7f1d1d, { emissive: 0xef4444, emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    g.add(kit.box(0.22, 0.12, 0.04, head, s * wid * 0.32, maten ? maten.lamp : base + 0.28, len / 2 + 0.01, false));
    g.add(kit.box(0.2, 0.1, 0.04, tail, s * wid * 0.34, maten ? maten.achterlamp : base + 0.3, -len / 2 - 0.01, false));
  }
  const axle = maten ? asAfstand(look.cabin, len) : len * 0.34;
  const velg = kit.mat(0xcbd5e1, { roughness: 0.35, metalness: 0.6 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = wheel(kit, sx * (wid / 2 - 0.05), sz * axle);
      g.add(w);
      if (maten) {
        const v = new THREE.Mesh(kit.geo("velg", () => velgVorm()), velg);
        v.position.copy(w.position);
        g.add(v);
      }
    }
  }
  if (opts.severity === "critical" || opts.severity === "warning") {
    const c = opts.severity === "critical" ? 0xdc2626 : 0xf59e0b;
    // gedeeld per kleur: alle zwaailichten knipperen samen
    const beacon = kit.mat(c, { emissive: c, emissiveIntensity: 1 });
    const top = maten ? maten.dak : look.cabin === "car" ? base + hgt + 0.42 : base + hgt;
    const lamp = new THREE.Mesh(kit.geo("beacon", () => new THREE.SphereGeometry(0.17, 12, 8)), beacon);
    lamp.position.set(0, top + 0.12, look.cabin === "van" ? -len * 0.14 : 0);
    g.add(lamp);
  }
  g.add(blob(kit, shadow, wid * 1.6, len * 1.3));
  return g;
}

/**
 * De echte carrosserie (realistische weergave): één profiel met wielkasten, een glazen kap of voorruit, en bij een auto
 * een dak en een middenstijl in de kleur van de auto; een bus houdt zijn ruitenband en krijgt een voorruit.
 */
function echteCarrosserie(kit: Kit, g: THREE.Group, look: Look, bodyMat: THREE.Material, glass: THREE.Material, maten: AutoMaten) {
  const { len, wid, hgt, cabin } = look;
  const sleutel = `${cabin}:${len}:${wid}:${hgt}`;
  g.add(new THREE.Mesh(kit.geo(`romp:${sleutel}`, () => rompVorm(cabin, len, wid, hgt)), bodyMat));
  if (cabin === "bus") {
    g.add(kit.box(wid + 0.02, hgt * 0.32, len * 0.86, glass, 0, 0.32 + hgt * 0.66, 0, false));
    g.add(kit.box(wid * 0.9, 0.6, 0.04, glass, 0, 1.22, len / 2 + 0.01, false));
    return;
  }
  g.add(new THREE.Mesh(kit.geo(`ruit:${sleutel}`, () => glasVorm(cabin, len, wid, hgt) ?? new THREE.BufferGeometry()), glass));
  if (cabin === "car") {
    g.add(kit.box(wid * 0.86, 0.05, len * 0.25 + 0.06, bodyMat, 0, maten.dak - 0.03, -len * 0.125, false));
    g.add(kit.box(wid * 0.87, 0.4, 0.07, bodyMat, 0, maten.boven + 0.2, -len * 0.09, false));
  }
}

/** Fietser (of alleen de fiets, geparkeerd in het rek bij een klant). */
export function bike(kit: Kit, color: number, shadow: THREE.Texture, rider = true) {
  return cached(kit, `fiets|${color}|${rider}`, () => buildBike(kit, color, shadow, rider));
}

function buildBike(kit: Kit, color: number, shadow: THREE.Texture, rider: boolean) {
  const g = new THREE.Group();
  const frame = kit.mat(color, { roughness: 0.4, metalness: 0.3 });
  const tyre = kit.mat(0x111827, { roughness: 0.9 });
  const w = kit.geo("bike-wheel", () => new THREE.TorusGeometry(0.3, 0.045, 6, 18).rotateY(Math.PI / 2));
  for (const z of [-0.42, 0.42]) {
    const t = new THREE.Mesh(w, tyre);
    t.position.set(0, 0.34, z);
    g.add(t);
  }
  g.add(kit.box(0.06, 0.06, 0.86, frame, 0, 0.56, 0, false));
  g.add(kit.box(0.06, 0.34, 0.06, frame, 0, 0.62, 0.32, false));
  g.add(kit.box(0.4, 0.05, 0.05, frame, 0, 0.8, 0.32, false));
  if (rider) {
    const body = new THREE.Mesh(
      kit.geo("rider", () => new THREE.CapsuleGeometry(0.17, 0.42, 4, 8)),
      kit.mat(color, { roughness: 0.6 }),
    );
    body.position.set(0, 1.08, 0.02);
    body.rotation.x = 0.25;
    const head = new THREE.Mesh(
      kit.geo("rider-head", () => new THREE.SphereGeometry(0.15, 12, 8)),
      kit.mat(0xf1c7a3, { roughness: 0.7 }),
    );
    head.position.set(0, 1.5, 0.12);
    g.add(body, head);
  }
  g.add(blob(kit, shadow, 0.6, 1.3));
  return g;
}

/** Rondvaartboot op de gracht. */
export function boat(kit: Kit, color: number) {
  const g = new THREE.Group();
  g.add(kit.box(1.8, 0.5, 6.5, kit.mat(color, { roughness: 0.5 }), 0, 0.25, 0, false));
  g.add(kit.box(1.5, 0.7, 4.6, kit.mat(0x9fd3f5, { roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.75 }), 0, 0.85, -0.2, false));
  g.add(kit.box(1.55, 0.06, 4.7, kit.mat(0xf8fafc), 0, 1.22, -0.2, false));
  g.userData.live = true;
  return g;
}

/** Laat iets over een route lopen of rijden; draait mee met de rijrichting. */
export class Mover {
  leg = 1;
  done = false;
  constructor(
    readonly obj: THREE.Object3D,
    public path: Pt[],
    public speed: number,
    public y = 0,
  ) {
    const p = path[0] ?? [0, 0];
    obj.position.set(p[0], y, p[1]);
    const next = path[1];
    if (next) obj.rotation.y = Math.atan2(next[0] - p[0], next[1] - p[1]);
  }

  /** Nieuwe route vanaf de huidige plek. */
  reroute(path: Pt[], speed = this.speed) {
    this.path = path;
    this.speed = speed;
    this.leg = 1;
    this.done = false;
  }

  step(dt: number): boolean {
    if (this.done) return true;
    let budget = this.speed * dt;
    while (budget > 0) {
      const target = this.path[this.leg];
      if (!target) {
        this.done = true;
        return true;
      }
      const dx = target[0] - this.obj.position.x;
      const dz = target[1] - this.obj.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1e-6) {
        this.leg += 1;
        continue;
      }
      const want = Math.atan2(dx, dz);
      let diff = want - this.obj.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.obj.rotation.y += diff * Math.min(1, dt * 12);
      const s = Math.min(dist, budget);
      this.obj.position.x += (dx / dist) * s;
      this.obj.position.z += (dz / dist) * s;
      budget -= s;
      if (s >= dist) this.leg += 1;
      else break;
    }
    return false;
  }
}
