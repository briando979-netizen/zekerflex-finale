import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Pt } from "@/lib/admin/city-layout";
import {
  alongLoop,
  BENCHES,
  CANAL_WATER,
  crowdSize,
  inPond,
  inRect,
  loopLength,
  MEADOW_COWS,
  MEADOW_SHEEP,
  type Phase,
  pickBlock,
  POND,
  precipitationAmount,
  sidewalkLoop,
  steerInside,
  type WeatherKind,
} from "@/lib/admin/city-life";
import { type Kit, seeded } from "@/components/admin/city/parts";

// Leven in de 3D-stad: voetgangers (bezoekers van de site in een blauwe jas,
// verder bewoners), mensen op bankjes, honden aan de lijn, eenden, vogels,
// koeien en schapen in de polder, wolken, regen en sneeuw. Alles wat veel
// voorkomt staat in één "instanced" vorm per lichaamsdeel: de videokaart
// tekent alle benen van alle mensen in één keer, hoeveel mensen er ook lopen.

const SIDEWALK = 0.14; // bovenkant van de stoep (SLAB in world.ts)
const GROUND = 0.17; // bovenkant van park, plein en tuinen (DISTRICT in world.ts)
const MAX_WALKERS = 110;
const MAX_DOGS = 10;
/** Felblauwe jas = een echte bezoeker van de site; geen andere kleding of auto heeft deze kleur. */
export const VISITOR_JACKET = 0x0ea5e9;
const SKIN = [0xf1c7a3, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x6b4423];
const HAIR = [0x2b1d0e, 0x4b2e1a, 0x8a5a2b, 0xd6b370, 0x1f1f1f, 0x9ca3af, 0xb45309];
const SHIRTS = [0xdc2626, 0x16a34a, 0xf59e0b, 0x7c3aed, 0x0f766e, 0xf8fafc, 0x1f2937, 0xdb2777, 0x92400e, 0x65a30d, 0xea580c];
const PANTS = [0x1e293b, 0x334155, 0x1c1917, 0x44403c, 0x1e3a8a, 0x57534e];
const DOGS = [0x78350f, 0xf5f5f4, 0x1c1917, 0xd6a35c, 0x57534e];

const _base = new THREE.Matrix4();
const _local = new THREE.Matrix4();
const _rot = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Color();

function setBase(x: number, y: number, z: number, yaw: number, scale: number) {
  _p.set(x, y, z);
  _q.setFromAxisAngle(UP, yaw);
  _s.setScalar(scale);
  _base.compose(_p, _q, _s);
}
function setPart(mesh: THREE.InstancedMesh, i: number, ox: number, oy: number, oz: number, rx = 0, rz = 0) {
  _local.makeTranslation(ox, oy, oz);
  if (rx || rz) _local.multiply(_rot.makeRotationFromEuler(_e.set(rx, 0, rz)));
  _m.multiplyMatrices(_base, _local);
  mesh.setMatrixAt(i, _m);
}

interface Walker {
  loop: Pt[];
  len: number;
  t: number;
  dir: 1 | -1;
  speed: number;
  scale: number;
  phase: number;
  side: number;
  visitor: boolean;
  idle: number;
  seat: { x: number; z: number; ry: number } | null;
  dog: boolean;
}

interface Animal {
  x: number;
  z: number;
  heading: number;
  speed: number;
  until: number;
  phase: number;
  graze: number;
}

export interface LifeState {
  phase: Phase;
  visitors: number;
  weather: WeatherKind;
  mmPerHour: number;
  /** Echte windsnelheid in Amsterdam: de wolken drijven harder als het harder waait. */
  windKmh: number;
}

export interface Life {
  setState: (s: LifeState) => void;
  /** Feestdag: op Koningsdag lopen de bewoners in het oranje (bezoekers houden hun felblauwe jas). */
  setHoliday: (h: string | null) => void;
  update: (dt: number, now: number, around: THREE.Vector3) => void;
  dispose: () => void;
}

export function createLife(root: Kit, scene: THREE.Scene, blobTex: THREE.Texture): Life {
  const kit = root.scope();
  const group = new THREE.Group();
  scene.add(group);
  const rnd = seeded(77);
  const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)] as T;

  /** Vorm voor veel exemplaren tegelijk; posities worden elk beeld bijgewerkt. */
  const many = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, colors = false) => {
    const m = kit.track(new THREE.InstancedMesh(geo, mat, n));
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    if (colors) {
      for (let i = 0; i < n; i++) m.setColorAt(i, _c.setHex(0xffffff));
    }
    group.add(m);
    return m;
  };
  const white = (extra: Parameters<Kit["mat"]>[1] = {}) => kit.mat(0xffffff, { roughness: 0.8, ...extra });
  const pivotTop = (g: THREE.BufferGeometry, h: number) => g.translate(0, -h / 2, 0);

  // --- voetgangers ---------------------------------------------------------
  const leg = many(kit.geo("p-leg", () => pivotTop(new THREE.BoxGeometry(0.16, 0.8, 0.18), 0.8)), white(), MAX_WALKERS * 2, true);
  const arm = many(kit.geo("p-arm", () => pivotTop(new THREE.BoxGeometry(0.12, 0.62, 0.14), 0.62)), white(), MAX_WALKERS * 2, true);
  const torso = many(kit.geo("p-torso", () => new THREE.BoxGeometry(0.42, 0.62, 0.24)), white(), MAX_WALKERS, true);
  const head = many(kit.geo("p-head", () => new THREE.SphereGeometry(0.15, 12, 8)), white({ roughness: 0.6 }), MAX_WALKERS, true);
  const hair = many(kit.geo("p-hair", () => new THREE.SphereGeometry(0.162, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), white({ roughness: 0.9 }), MAX_WALKERS, true);
  const umbrella = many(kit.geo("p-umbrella", () => new THREE.ConeGeometry(0.62, 0.28, 10, 1, true)), kit.own({ color: 0x1f2937, roughness: 0.6, side: THREE.DoubleSide }), MAX_WALKERS);
  const blobMat = kit.track(new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
  const blobs = many(kit.geo("p-blob", () => new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2)), blobMat, MAX_WALKERS + 30);
  blobs.renderOrder = 1;

  // honden aan de lijn
  const dogBody = many(kit.geo("d-body", () => new THREE.BoxGeometry(0.22, 0.22, 0.55)), white(), MAX_DOGS, true);
  const dogHead = many(kit.geo("d-head", () => new THREE.BoxGeometry(0.2, 0.2, 0.24)), white(), MAX_DOGS, true);
  const dogLeg = many(kit.geo("d-leg", () => pivotTop(new THREE.BoxGeometry(0.07, 0.3, 0.07), 0.3)), white(), MAX_DOGS * 4, true);
  const dogTail = many(kit.geo("d-tail", () => new THREE.BoxGeometry(0.05, 0.05, 0.26)), white(), MAX_DOGS, true);

  const walkers: Walker[] = [];
  const loops = Array.from({ length: 25 }, (_, k) => sidewalkLoop(k % 5, Math.floor(k / 5)));
  const newWalker = (visitor: boolean): Walker => {
    const [bi, bj] = pickBlock(rnd());
    const loop = loops[bj * 5 + bi] ?? pick(loops);
    return { loop, len: loopLength(loop), t: rnd(), dir: rnd() < 0.5 ? 1 : -1, speed: 1 + rnd() * 0.6, scale: rnd() < 0.15 ? 0.68 : 0.92 + rnd() * 0.16, phase: rnd() * 6, side: (rnd() - 0.5) * 0.14, visitor, idle: 0, seat: null, dog: false };
  };
  // vaste kleuren per voetganger (huid, haar, kleding)
  const looks = Array.from({ length: MAX_WALKERS }, () => ({ skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRTS), pants: pick(PANTS) }));
  const dogColors = Array.from({ length: MAX_DOGS }, () => pick(DOGS));
  let raining = false;
  let orange = false;

  const paint = () => {
    walkers.forEach((w, i) => {
      const l = looks[i] ?? looks[0]!;
      const shirt = w.visitor ? VISITOR_JACKET : orange ? 0xf97316 : l.shirt;
      torso.setColorAt(i, _c.setHex(shirt));
      arm.setColorAt(i * 2, _c);
      arm.setColorAt(i * 2 + 1, _c);
      leg.setColorAt(i * 2, _c.setHex(l.pants));
      leg.setColorAt(i * 2 + 1, _c);
      head.setColorAt(i, _c.setHex(l.skin));
      hair.setColorAt(i, _c.setHex(l.hair));
    });
    for (let k = 0; k < MAX_DOGS; k++) {
      const c = dogColors[k] ?? 0x78350f;
      dogBody.setColorAt(k, _c.setHex(c));
      dogHead.setColorAt(k, _c);
      dogTail.setColorAt(k, _c);
      for (let f = 0; f < 4; f++) dogLeg.setColorAt(k * 4 + f, _c);
    }
    for (const m of [torso, arm, leg, head, hair, dogBody, dogHead, dogTail, dogLeg]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  };

  // --- bankjes (vast) ------------------------------------------------------
  const seatGeo = kit.geo("bench-seat", () => new THREE.BoxGeometry(1.6, 0.08, 0.46));
  const backGeo = kit.geo("bench-back", () => new THREE.BoxGeometry(1.6, 0.42, 0.07));
  const wood = kit.mat(0x92400e, { roughness: 0.8 });
  const seats: { x: number; z: number; ry: number }[] = [];
  for (const b of BENCHES) {
    const g = new THREE.Group();
    g.position.set(b.x, GROUND, b.z);
    g.rotation.y = b.ry;
    const seat = new THREE.Mesh(seatGeo, wood);
    seat.position.set(0, 0.45, 0);
    const back = new THREE.Mesh(backGeo, wood);
    back.position.set(0, 0.7, -0.22);
    const legs = new THREE.Mesh(kit.geo("bench-legs", () => new THREE.BoxGeometry(1.4, 0.42, 0.3)), kit.mat(0x334155, { roughness: 0.5, metalness: 0.4 }));
    legs.position.set(0, 0.21, 0);
    g.add(seat, back, legs);
    group.add(g);
    // twee zitplaatsen per bankje, in wereldcoördinaten
    for (const dx of [-0.4, 0.4]) {
      const cos = Math.cos(b.ry);
      const sin = Math.sin(b.ry);
      seats.push({ x: b.x + dx * cos + 0.02 * sin, z: b.z - dx * sin + 0.02 * cos, ry: b.ry });
    }
  }

  // --- eenden ---------------------------------------------------------------
  const DUCKS = 14;
  const duckBody = many(kit.geo("duck-body", () => new THREE.SphereGeometry(1, 10, 8).scale(0.2, 0.12, 0.28)), white({ roughness: 0.7 }), DUCKS, true);
  const duckHead = many(kit.geo("duck-head", () => new THREE.SphereGeometry(0.08, 8, 6)), white({ roughness: 0.5 }), DUCKS, true);
  const ducks: (Animal & { pond: boolean })[] = Array.from({ length: DUCKS }, (_, k) => {
    const pond = k < 6;
    const x = pond ? POND.x + (rnd() - 0.5) * POND.rx : CANAL_WATER.x0 + 20 + rnd() * (CANAL_WATER.x1 - CANAL_WATER.x0 - 40);
    const z = pond ? POND.z + (rnd() - 0.5) * POND.rz : CANAL_WATER.z0 + rnd() * (CANAL_WATER.z1 - CANAL_WATER.z0);
    const male = rnd() < 0.5;
    duckBody.setColorAt(k, _c.setHex(male ? 0xa8a29e : 0x92704f));
    duckHead.setColorAt(k, _c.setHex(male ? 0x166534 : 0x78553a));
    return { x, z, heading: rnd() * 6, speed: 0.25 + rnd() * 0.2, until: 0, phase: rnd() * 6, graze: 0, pond };
  });
  duckBody.count = duckHead.count = DUCKS;
  if (duckBody.instanceColor) duckBody.instanceColor.needsUpdate = true;
  if (duckHead.instanceColor) duckHead.instanceColor.needsUpdate = true;

  // --- vogels -----------------------------------------------------------------
  const BIRDS = 18;
  const birdBody = many(kit.geo("bird-body", () => new THREE.BoxGeometry(0.12, 0.1, 0.42)), kit.mat(0x1f2937), BIRDS);
  const wingGeoL = kit.geo("bird-wing-l", () => new THREE.BoxGeometry(0.62, 0.03, 0.22).translate(-0.31, 0, 0));
  const wingGeoR = kit.geo("bird-wing-r", () => new THREE.BoxGeometry(0.62, 0.03, 0.22).translate(0.31, 0, 0));
  const wingL = many(wingGeoL, kit.mat(0x334155), BIRDS);
  const wingR = many(wingGeoR, kit.mat(0x334155), BIRDS);
  const birds = Array.from({ length: BIRDS }, (_, k) => ({ flock: k % 2, off: [(rnd() - 0.5) * 9, (rnd() - 0.5) * 3, (rnd() - 0.5) * 9] as const, flap: rnd() * 6 }));
  const flocks = [
    { r: 55, h: 30, speed: 0.06, cx: -10, cz: -5, a: 0 },
    { r: 80, h: 38, speed: -0.045, cx: 20, cz: 10, a: 2 },
  ];

  // --- koeien en schapen ------------------------------------------------------
  const COWS = 12;
  const SHEEP = 16;
  const cowBody = many(kit.geo("cow-body", () => new THREE.BoxGeometry(0.7, 0.62, 1.35)), white(), COWS, true);
  const cowHead = many(kit.geo("cow-head", () => new THREE.BoxGeometry(0.36, 0.36, 0.46)), white(), COWS, true);
  const cowLeg = many(kit.geo("cow-leg", () => pivotTop(new THREE.BoxGeometry(0.14, 0.66, 0.14), 0.66)), white(), COWS * 4, true);
  const cowSpot = many(kit.geo("cow-spot", () => new THREE.BoxGeometry(0.72, 0.4, 0.5)), kit.mat(0x111827), COWS * 2);
  const sheepBody = many(kit.geo("sheep-body", () => new THREE.IcosahedronGeometry(0.42, 1).scale(1, 0.85, 1.3)), kit.mat(0xf5f5f4, { roughness: 1, flatShading: true }), SHEEP);
  const sheepHead = many(kit.geo("sheep-head", () => new THREE.BoxGeometry(0.2, 0.24, 0.3)), kit.mat(0x1c1917), SHEEP);
  const sheepLeg = many(kit.geo("sheep-leg", () => pivotTop(new THREE.BoxGeometry(0.07, 0.4, 0.07), 0.4)), kit.mat(0x1c1917), SHEEP * 4);
  const spawn = (r: typeof MEADOW_COWS): Animal => ({ x: r.x0 + 4 + rnd() * (r.x1 - r.x0 - 8), z: r.z0 + 4 + rnd() * (r.z1 - r.z0 - 8), heading: rnd() * 6, speed: 0, until: 0, phase: rnd() * 6, graze: rnd() });
  const cows = Array.from({ length: COWS }, () => spawn(MEADOW_COWS));
  const sheep = Array.from({ length: SHEEP }, () => spawn(MEADOW_SHEEP));
  // Fries-Hollands (zwartbont), blaarkop (rood met witte kop) en zwart
  const cowKinds = cows.map((_, k) => (k % 3 === 0 ? "blaarkop" : k % 5 === 0 ? "zwart" : "bont"));
  cowKinds.forEach((kind, k) => {
    const body = kind === "blaarkop" ? 0x7c2d12 : kind === "zwart" ? 0x1c1917 : 0xf5f5f4;
    cowBody.setColorAt(k, _c.setHex(body));
    cowHead.setColorAt(k, _c.setHex(kind === "zwart" ? 0x1c1917 : 0xf5f5f4));
    for (let f = 0; f < 4; f++) cowLeg.setColorAt(k * 4 + f, _c.setHex(body));
  });
  for (const m of [cowBody, cowHead, cowLeg]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  cowBody.count = cowHead.count = COWS;
  cowLeg.count = COWS * 4;
  cowSpot.count = COWS * 2;
  sheepBody.count = sheepHead.count = SHEEP;
  sheepLeg.count = SHEEP * 4;

  // --- wolken --------------------------------------------------------------------
  const CLOUDS = 16;
  const cloudGeo = kit.geo("cloud", () =>
    mergeGeometries(
      [
        [0, 0, 0, 6],
        [5, 0.8, 1, 4.5],
        [-5, 0.4, -1, 4.2],
        [2, 2.6, -1.5, 4],
        [-2, 2, 1.5, 3.6],
      ].map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 1).translate(x ?? 0, y ?? 0, z ?? 0)),
    ) ?? new THREE.IcosahedronGeometry(6, 1),
  );
  const cloudMat = kit.own({ color: 0xffffff, roughness: 1, flatShading: true });
  const clouds = many(cloudGeo, cloudMat, CLOUDS);
  const cloudPos = Array.from({ length: CLOUDS }, (_, k) => {
    const a = (k / CLOUDS) * Math.PI * 2 + rnd() * 0.3;
    const r = 150 + rnd() * 170;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 70 + rnd() * 45, s: 0.9 + rnd() * 0.9, ry: rnd() * 6 };
  });
  let cloudShown = 6;

  // --- regen en sneeuw (rond wat je bekijkt) ---------------------------------------
  const DROPS = 1600;
  const rainPos = new Float32Array(DROPS * 6);
  const rainGeo = kit.track(new THREE.BufferGeometry());
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3).setUsage(THREE.DynamicDrawUsage));
  const rain = new THREE.LineSegments(rainGeo, kit.track(new THREE.LineBasicMaterial({ color: 0x9fb7cc, transparent: true, opacity: 0.55 })));
  rain.frustumCulled = false;
  const FLAKES = 1100;
  const snowPos = new Float32Array(FLAKES * 3);
  const snowGeo = kit.track(new THREE.BufferGeometry());
  snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3).setUsage(THREE.DynamicDrawUsage));
  const snow = new THREE.Points(snowGeo, kit.track(new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0.9 })));
  snow.frustumCulled = false;
  group.add(rain, snow);
  const BOX = 75;
  const seed = (arr: Float32Array, stride: number, n: number, around: THREE.Vector3) => {
    for (let i = 0; i < n; i++) {
      const x = around.x + (rnd() - 0.5) * 2 * BOX;
      const z = around.z + (rnd() - 0.5) * 2 * BOX;
      const y = rnd() * 50;
      arr[i * stride] = x;
      arr[i * stride + 1] = y;
      arr[i * stride + 2] = z;
      if (stride === 6) {
        arr[i * 6 + 3] = x;
        arr[i * 6 + 4] = y + 1.1;
        arr[i * 6 + 5] = z;
      }
    }
  };
  let drops = 0;
  let flakes = 0;
  let seeded1 = false;
  rain.visible = snow.visible = false;

  // --- wie er loopt, naar dagdeel, bezoekers en weer ---------------------------------
  let env = "";
  let crowdKey = "";
  let wind = 12;
  const setState = (s: LifeState) => {
    wind = s.windKmh;
    const { visitors, residents } = crowdSize(s.phase, s.visitors, s.weather);
    const key = `${s.phase}|${s.weather}|${visitors}|${residents}|${Math.round(s.mmPerHour * 2)}`;
    if (key === crowdKey) return;
    crowdKey = key;
    const want = Math.min(MAX_WALKERS, visitors + residents);
    while (walkers.length < want) walkers.push(newWalker(false));
    walkers.length = want;
    walkers.forEach((w, i) => (w.visitor = i < visitors));
    // Zitplaatsen en honden alleen opnieuw verdelen als het dagdeel of het weer verandert,
    // anders springen mensen van bankje naar bankje zodra er een bezoeker bijkomt.
    const nextEnv = `${s.phase}|${s.weather}`;
    if (nextEnv !== env) {
      env = nextEnv;
      walkers.forEach((w) => {
        w.seat = null;
        w.dog = false;
      });
      // bij droog weer zitten er mensen op een bankje; sommige bewoners laten de hond uit
      const sitters = s.weather === "helder" || s.weather === "bewolkt" ? Math.min(seats.length, Math.round(residents * (s.phase === "dag" ? 0.28 : 0.12))) : 0;
      const free = [...seats];
      let dogs = 0;
      for (let i = visitors; i < walkers.length; i++) {
        const w = walkers[i];
        if (!w) continue;
        if (free.length && i - visitors < sitters) w.seat = free.splice(Math.floor(rnd() * free.length), 1)[0] ?? null;
        else if (dogs < MAX_DOGS && w.scale > 0.8 && rnd() < 0.25) {
          w.dog = true;
          dogs += 1;
        }
      }
    }
    raining = s.weather === "regen" || s.weather === "motregen" || s.weather === "onweer";
    const amount = precipitationAmount(s.weather, s.mmPerHour);
    drops = s.weather === "sneeuw" ? 0 : Math.min(DROPS, amount);
    flakes = s.weather === "sneeuw" ? Math.min(FLAKES, amount) : 0;
    rain.visible = drops > 0;
    snow.visible = flakes > 0;
    rainGeo.setDrawRange(0, drops * 2);
    snowGeo.setDrawRange(0, flakes);
    cloudShown = s.weather === "helder" ? 5 : s.weather === "bewolkt" || s.weather === "mist" ? 12 : CLOUDS;
    cloudMat.color.setHex(raining || s.weather === "sneeuw" ? 0x9ca3af : s.weather === "bewolkt" ? 0xe5e7eb : 0xffffff);
    const birdsOut = s.phase !== "nacht" && !raining && s.weather !== "sneeuw";
    birdBody.visible = wingL.visible = wingR.visible = birdsOut;
    paint();
  };

  const update = (dt: number, now: number, around: THREE.Vector3) => {
    const sec = now / 1000;
    // voetgangers
    let dogI = 0;
    walkers.forEach((w, i) => {
      let x: number;
      let z: number;
      let yaw: number;
      let swing = 0;
      let y = SIDEWALK;
      if (w.seat) {
        x = w.seat.x;
        z = w.seat.z;
        yaw = w.seat.ry;
        // heupen op de zitting (0,47 boven de grond); de heup zit op 0,85 × lengte
        y = GROUND + 0.47 - 0.85 * w.scale;
      } else {
        if (w.idle > 0) w.idle -= dt;
        else {
          w.t += (w.dir * w.speed * dt) / w.len;
          w.phase += dt * w.speed * 5.4;
          swing = Math.sin(w.phase);
          if (rnd() < dt * 0.02) w.idle = 1.5 + rnd() * 3; // even stilstaan en rondkijken
        }
        const p = alongLoop(w.loop, w.t);
        const sx = w.dir > 0 ? p.dir[0] : -p.dir[0];
        const sz = w.dir > 0 ? p.dir[1] : -p.dir[1];
        x = p.at[0] - sz * w.side;
        z = p.at[1] + sx * w.side;
        yaw = Math.atan2(sx, sz);
      }
      const s = w.scale;
      const bob = w.seat || w.idle > 0 ? 0 : Math.abs(Math.cos(w.phase)) * 0.03;
      setBase(x, y + bob, z, yaw, s);
      const legRot = w.seat ? -1.45 : swing * 0.5;
      setPart(leg, i * 2, -0.1, 0.85, 0, legRot);
      setPart(leg, i * 2 + 1, 0.1, 0.85, 0, w.seat ? -1.45 : -swing * 0.5);
      setPart(torso, i, 0, 1.17, 0);
      setPart(arm, i * 2, -0.28, 1.45, 0, w.seat ? -0.5 : -swing * 0.45);
      setPart(arm, i * 2 + 1, 0.28, 1.45, 0, w.seat ? -0.5 : swing * 0.45);
      setPart(head, i, 0, 1.63, 0);
      setPart(hair, i, 0, 1.66, -0.01);
      setPart(umbrella, i, 0.15, w.seat ? -50 : 2.12, 0);
      setPart(blobs, i, 0, 0.02, 0);
      // de hond loopt links naast zijn baasje, zoals bij hondentraining
      if (w.dog && dogI < MAX_DOGS) {
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const dx = x + cos * 0.55 + sin * 0.25;
        const dz = z - sin * 0.55 + cos * 0.25;
        setBase(dx, SIDEWALK, dz, yaw, 1);
        const trot = Math.sin(w.phase * 1.6) * (w.idle > 0 ? 0 : 0.6);
        setPart(dogBody, dogI, 0, 0.36, 0);
        setPart(dogHead, dogI, 0, 0.5, 0.34);
        setPart(dogTail, dogI, 0, 0.45, -0.34, 0.6 + Math.sin(sec * 9) * 0.25);
        setPart(dogLeg, dogI * 4, -0.08, 0.3, 0.2, trot);
        setPart(dogLeg, dogI * 4 + 1, 0.08, 0.3, 0.2, -trot);
        setPart(dogLeg, dogI * 4 + 2, -0.08, 0.3, -0.2, -trot);
        setPart(dogLeg, dogI * 4 + 3, 0.08, 0.3, -0.2, trot);
        dogI += 1;
      }
    });
    const n = walkers.length;
    leg.count = arm.count = n * 2;
    torso.count = head.count = hair.count = n;
    umbrella.count = raining ? n : 0;
    // ook de koeien krijgen een schaduwvlek (achter de voetgangers in dezelfde lijst)
    cows.forEach((c, k) => {
      setBase(c.x, 0, c.z, c.heading, 1);
      _local.makeScale(2.2, 1, 2.8).setPosition(0, 0.03, 0);
      _m.multiplyMatrices(_base, _local);
      blobs.setMatrixAt(n + k, _m);
    });
    blobs.count = n + COWS;
    dogBody.count = dogHead.count = dogTail.count = dogI;
    dogLeg.count = dogI * 4;

    // eenden: dobberen en rustig rondpeddelen
    ducks.forEach((d, k) => {
      if (now > d.until) {
        d.heading += (rnd() - 0.5) * 2.2;
        d.until = now + 2000 + rnd() * 5000;
      }
      const nx = d.x + Math.sin(d.heading) * d.speed * dt;
      const nz = d.z + Math.cos(d.heading) * d.speed * dt;
      const ok = d.pond ? inPond(nx, nz, 0.9) : inRect(CANAL_WATER, nx, nz, 0.3);
      if (ok) {
        d.x = nx;
        d.z = nz;
      } else d.heading += Math.PI * 0.6;
      const y = (d.pond ? GROUND + 0.02 : -0.35) + Math.sin(sec * 2 + d.phase) * 0.02;
      setBase(d.x, y, d.z, d.heading, 1);
      setPart(duckBody, k, 0, 0.06, 0);
      setPart(duckHead, k, 0, 0.22, 0.2);
    });

    // vogels: twee zwermen die rondjes boven de stad vliegen
    if (birdBody.visible) {
      for (const f of flocks) f.a += f.speed * dt;
      birds.forEach((b, k) => {
        const f = flocks[b.flock] ?? flocks[0]!;
        const a = f.a + k * 0.01;
        const x = f.cx + Math.cos(a) * f.r + b.off[0];
        const z = f.cz + Math.sin(a) * f.r + b.off[2];
        const yaw = Math.atan2(-Math.sin(a) * Math.sign(f.speed), Math.cos(a) * Math.sign(f.speed));
        b.flap += dt * 11;
        const w = Math.sin(b.flap) * 0.7;
        setBase(x, f.h + b.off[1] + Math.sin(sec + k) * 0.6, z, yaw, 1);
        setPart(birdBody, k, 0, 0, 0);
        setPart(wingL, k, -0.06, 0, 0, 0, w);
        setPart(wingR, k, 0.06, 0, 0, 0, -w);
      });
      birdBody.count = wingL.count = wingR.count = BIRDS;
    }

    // koeien en schapen: grazen, af en toe een stukje verder lopen
    const herd = (list: Animal[], r: typeof MEADOW_COWS) => {
      for (const a of list) {
        if (now > a.until) {
          const walk = rnd() < 0.35;
          a.speed = walk ? 0.35 + rnd() * 0.25 : 0;
          a.heading += (rnd() - 0.5) * 1.6;
          a.until = now + (walk ? 2500 + rnd() * 4000 : 4000 + rnd() * 9000);
        }
        a.heading = steerInside(r, a.x, a.z, a.heading, 3);
        a.x += Math.sin(a.heading) * a.speed * dt;
        a.z += Math.cos(a.heading) * a.speed * dt;
        a.graze = a.speed > 0 ? Math.max(0, a.graze - dt * 2) : Math.min(1, a.graze + dt * 0.8);
        a.phase += dt * a.speed * 6;
      }
    };
    herd(cows, MEADOW_COWS);
    herd(sheep, MEADOW_SHEEP);
    cows.forEach((c, k) => {
      const step = Math.sin(c.phase) * (c.speed > 0 ? 0.35 : 0);
      setBase(c.x, 0, c.z, c.heading, 1);
      setPart(cowBody, k, 0, 0.98, 0);
      setPart(cowHead, k, 0, 1.08 - c.graze * 0.55, 0.82, c.graze * 0.7);
      setPart(cowLeg, k * 4, -0.24, 0.68, 0.48, step);
      setPart(cowLeg, k * 4 + 1, 0.24, 0.68, 0.48, -step);
      setPart(cowLeg, k * 4 + 2, -0.24, 0.68, -0.48, -step);
      setPart(cowLeg, k * 4 + 3, 0.24, 0.68, -0.48, step);
      const spots = cowKinds[k] === "bont";
      setPart(cowSpot, k * 2, spots ? 0.005 : 0, spots ? 1.05 : -50, 0.25);
      setPart(cowSpot, k * 2 + 1, spots ? -0.005 : 0, spots ? 0.95 : -50, -0.38);
    });
    sheep.forEach((s, k) => {
      const step = Math.sin(s.phase) * (s.speed > 0 ? 0.4 : 0);
      setBase(s.x, 0, s.z, s.heading, 1);
      setPart(sheepBody, k, 0, 0.62, 0);
      setPart(sheepHead, k, 0, 0.72 - s.graze * 0.35, 0.55, s.graze * 0.6);
      setPart(sheepLeg, k * 4, -0.16, 0.4, 0.3, step);
      setPart(sheepLeg, k * 4 + 1, 0.16, 0.4, 0.3, -step);
      setPart(sheepLeg, k * 4 + 2, -0.16, 0.4, -0.3, -step);
      setPart(sheepLeg, k * 4 + 3, 0.16, 0.4, -0.3, step);
    });

    // wolken drijven langzaam met de wind mee
    cloudPos.forEach((c, k) => {
      c.x += dt * (0.3 + wind * 0.08);
      if (c.x > 330) c.x = -330;
      setBase(c.x, c.y, c.z, c.ry, c.s);
      setPart(clouds, k, 0, 0, 0);
    });
    clouds.count = cloudShown;

    // regen en sneeuw vallen rond het punt waar je naar kijkt
    if (!seeded1 && (drops || flakes)) {
      seed(rainPos, 6, DROPS, around);
      seed(snowPos, 3, FLAKES, around);
      seeded1 = true;
    }
    if (drops) {
      for (let i = 0; i < drops; i++) {
        const o = i * 6;
        let y = (rainPos[o + 1] ?? 0) - dt * 38;
        let x = rainPos[o] ?? 0;
        let z = rainPos[o + 2] ?? 0;
        if (y < 0 || Math.abs(x - around.x) > BOX || Math.abs(z - around.z) > BOX) {
          x = around.x + (rnd() - 0.5) * 2 * BOX;
          z = around.z + (rnd() - 0.5) * 2 * BOX;
          y = 45 + rnd() * 10;
        }
        rainPos[o] = x;
        rainPos[o + 1] = y;
        rainPos[o + 2] = z;
        rainPos[o + 3] = x - 0.15;
        rainPos[o + 4] = y + 1.1;
        rainPos[o + 5] = z;
      }
      rainGeo.attributes.position!.needsUpdate = true;
    }
    if (flakes) {
      for (let i = 0; i < flakes; i++) {
        const o = i * 3;
        let y = (snowPos[o + 1] ?? 0) - dt * 2.6;
        let x = (snowPos[o] ?? 0) + Math.sin(sec + i) * dt * 0.6;
        let z = snowPos[o + 2] ?? 0;
        if (y < 0 || Math.abs(x - around.x) > BOX || Math.abs(z - around.z) > BOX) {
          x = around.x + (rnd() - 0.5) * 2 * BOX;
          z = around.z + (rnd() - 0.5) * 2 * BOX;
          y = 40 + rnd() * 10;
        }
        snowPos[o] = x;
        snowPos[o + 1] = y;
        snowPos[o + 2] = z;
      }
      snowGeo.attributes.position!.needsUpdate = true;
    }

    for (const m of [leg, arm, torso, head, hair, umbrella, blobs, dogBody, dogHead, dogLeg, dogTail, duckBody, duckHead, birdBody, wingL, wingR, cowBody, cowHead, cowLeg, cowSpot, sheepBody, sheepHead, sheepLeg, clouds]) m.instanceMatrix.needsUpdate = true;
  };

  setState({ phase: "dag", visitors: 0, weather: "helder", mmPerHour: 0, windKmh: 12 });
  return {
    setState,
    setHoliday(h) {
      orange = h === "koningsdag";
      paint();
    },
    update,
    dispose: () => {
      group.removeFromParent();
      kit.dispose();
    },
  };
}
