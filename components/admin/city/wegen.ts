import * as THREE from "three";
import { CANAL_Z, laneOffset, pathLength, type Pt } from "@/lib/admin/city-layout";
import { overwegen, panden, type Pand, RING_B, ringPunten, ROUTES, SNELWEG_B, STEDEN, wegdelen } from "@/lib/admin/nl-wegen";
import { treinX } from "@/components/admin/city/nederland";
import { bake, gableGeometry, type Kit, signTexture, type windowTextures } from "@/components/admin/city/parts";
import { Mover, TRAFFIC_COLORS, vehicle } from "@/components/admin/city/vehicles";
import { type Glow, type Layer, ROAD_TOP } from "@/components/admin/city/world";

// Wegen naar de rest van Nederland (13 nov 2026, eigenaar: "ik kan nog steeds niet de hele stad verkennen of wegen
// zijn gebouwd, bouw helemaal uit"). Snelwegen van de afritten naar Amsterdam, Rotterdam, Utrecht en Groningen, met
// een brug over de gracht, een overweg bij het spoor (lichten en bomen als er een trein komt, auto's wachten),
// blauwe borden, en in elke stad een ringweg met stoepen, lantaarns en twee rijen panden. De lijnen en de panden
// komen uit lib/admin/nl-wegen.ts (puur, getest); hier alleen het tekenwerk en het verkeer. Panden zijn instancing:
// honderden panden kosten een paar tekenbeurten.

export interface Wegen {
  layer: Layer;
  update: (dt: number, now: number) => void;
}

const BAKSTEEN = [0x9a4a32, 0x7c3a28, 0xb4643f, 0x8b5e3c, 0x6b3f2a, 0xc7a17a, 0xd8cbb3, 0x5b4636] as const;
const GLAS = [0x64748b, 0x94a3b8, 0x475569, 0x7f9bb3, 0x334155, 0x9fb6c9, 0x5b6b7d, 0xa3b1c2] as const;
const DAKPAN = [0x5b4636, 0x374151, 0x7c2d12, 0x44403c] as const;
/** Rechts rijden: de auto's houden zoveel afstand tot het midden van de weg. */
const RIJSTROOK = 1.9;
/** Iedereen rijdt even hard: dan rijdt niemand door een ander heen. */
const SNELHEID = 16;

const kleurUit = (lijst: readonly number[], i: number) => lijst[((i % lijst.length) + lijst.length) % lijst.length] ?? 0x7c3a28;

export function buildWegen(root: Kit, shadow: THREE.Texture, win: ReturnType<typeof windowTextures>, reduced: boolean): Wegen {
  const kit = root.scope();
  const group = new THREE.Group();
  const vast = new THREE.Group();
  group.add(vast);
  const glows: Glow[] = [];
  // hetzelfde asfalt als de stad, zodat de aansluiting op de bestaande snelweg niet van kleur verspringt
  const asfalt = kit.mat(0x394150, { roughness: 0.95 });
  const wit = kit.mat(0xf1f5f9, { roughness: 0.7 });
  const stoep = kit.mat(0xcbd2da, { roughness: 0.95 });
  const grijs = kit.mat(0x6b7280, { roughness: 0.6, metalness: 0.4 });

  /** Een rechte strook van a naar b (weg, streep, stoep), langs de lijn gedraaid. */
  const strook = (a: Pt, b: Pt, breed: number, y: number, h: number, m: THREE.Material, langer = 0) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const box = kit.box(breed, h, Math.hypot(dx, dz) + langer, m, (a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, false);
    box.rotation.y = Math.atan2(dx, dz);
    vast.add(box);
  };

  // --- wegen: asfalt, kantstrepen, middenstreep; in de stad een stoep aan beide kanten --
  const streep: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const een = new THREE.Vector3(1, 1, 1);
  const UP = new THREE.Vector3(0, 1, 0);
  const ingangen: Pt[] = STEDEN.map((s) => ROUTES[s.id][ROUTES[s.id].length - 1]).filter((p): p is Pt => p !== undefined);
  for (const d of wegdelen()) {
    const { a, b, breed } = d;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const ux = (b[0] - a[0]) / len;
    const uz = (b[1] - a[1]) / len;
    const rx = -uz;
    const rz = ux;
    const verschoven = (o: number, van: number, tot: number): [Pt, Pt] => [
      [a[0] + rx * o + ux * van, a[1] + rz * o + uz * van],
      [b[0] + rx * o - ux * tot, b[1] + rz * o - uz * tot],
    ];
    strook(a, b, breed, ROAD_TOP / 2, ROAD_TOP, asfalt, breed);
    for (const kant of [-1, 1]) {
      const [p, r] = verschoven(kant * (breed / 2 - 0.35), breed / 2, breed / 2);
      strook(p, r, 0.14, ROAD_TOP + 0.006, 0.012, wit);
    }
    if (!d.snelweg) {
      // stoepen, met een opening waar de snelweg de ringweg op komt (anders rijdt het verkeer door de stoeprand)
      const ingang = ingangen.map((g) => (g[0] - a[0]) * ux + (g[1] - a[1]) * uz).find((t, i) => {
        const g = ingangen[i];
        return g !== undefined && t > 0 && t < len && Math.abs((g[0] - a[0]) * -uz + (g[1] - a[1]) * ux) < 1;
      });
      const stukken: [number, number][] = ingang === undefined ? [[-1.1, len + 1.1]] : [[-1.1, ingang - SNELWEG_B / 2 - 1], [ingang + SNELWEG_B / 2 + 1, len + 1.1]];
      for (const kant of [-1, 1]) {
        const o = kant * (breed / 2 + 1.1);
        for (const [van, tot] of stukken) strook([a[0] + rx * o + ux * van, a[1] + rz * o + uz * van], [a[0] + rx * o + ux * tot, a[1] + rz * o + uz * tot], 2.2, 0.09, 0.18, stoep);
      }
    }
    q.setFromAxisAngle(UP, Math.atan2(ux, uz));
    for (let t = breed; t < len - breed; t += 9) {
      m4.compose(new THREE.Vector3(a[0] + ux * t, ROAD_TOP + 0.006, a[1] + uz * t), q, een);
      streep.push(m4.clone());
    }
  }
  const strepen = kit.track(new THREE.InstancedMesh(kit.geo("nl-streep", () => new THREE.BoxGeometry(0.14, 0.012, 3)), wit, Math.max(1, streep.length)));
  streep.forEach((m, i) => strepen.setMatrixAt(i, m));
  strepen.count = streep.length;
  group.add(strepen);

  // --- brug over de gracht: een dek boven de kades, met een stenen rand --------
  const [cz0, cz1] = CANAL_Z;
  const rand = kit.mat(0x9a5b43, { roughness: 0.9 });
  for (const d of wegdelen()) {
    if (d.a[0] !== d.b[0] || Math.min(d.a[1], d.b[1]) > cz0 || Math.max(d.a[1], d.b[1]) < cz1) continue;
    const x = d.a[0];
    const lengte = cz1 - cz0 + 5;
    vast.add(kit.box(d.breed, 0.6, lengte, asfalt, x, ROAD_TOP + 0.08 - 0.3, (cz0 + cz1) / 2, false));
    for (const kant of [-1, 1]) vast.add(kit.box(0.45, 0.9, lengte, rand, x + kant * (d.breed / 2 + 0.22), ROAD_TOP + 0.45, (cz0 + cz1) / 2));
  }

  // --- overwegen: palen met een andreaskruis, knipperlichten en slagbomen --------
  const knipper = kit.own({ color: 0x450a0a, emissive: 0xef4444, emissiveIntensity: 0, roughness: 0.4 });
  const rood = kit.mat(0xdc2626, { roughness: 0.6 });
  const paal = kit.mat(0xf8fafc, { roughness: 0.6 });
  const slagbomen: { arm: THREE.Group; op: number }[] = [];
  const kruisingen = overwegen().map(([x, z]) => {
    for (const kant of [-1, 1] as const) {
      // rechts van de weg vóór het spoor, voor allebei de richtingen (noordwaarts links, zuidwaarts rechts van x)
      const px = x + kant * (SNELWEG_B / 2 + 0.9);
      const pz = z + kant * 5.5;
      vast.add(kit.box(0.16, 3.2, 0.16, paal, px, 1.6, pz));
      for (const y of [0.6, 1.4]) vast.add(kit.box(0.18, 0.3, 0.18, rood, px, y, pz, false));
      for (const hoek of [Math.PI / 4, -Math.PI / 4]) {
        const balk = kit.box(1.5, 0.2, 0.05, paal, px, 3.05, pz, false);
        balk.rotation.z = hoek;
        vast.add(balk);
      }
      const lamp = new THREE.Mesh(kit.geo("nl-overweglamp", () => new THREE.SphereGeometry(0.16, 10, 8)), knipper);
      // de lamp aan de kant van het verkeer dat eraan komt
      lamp.position.set(px, 2.45, pz + kant * 0.12);
      group.add(lamp);
      // slagboom: draait om de paal, steekt naar het midden van de weg
      const arm = new THREE.Group();
      arm.position.set(px, 1.1, pz);
      const lat = kit.box(SNELWEG_B / 2 + 0.2, 0.12, 0.12, paal, (-kant * (SNELWEG_B / 2 + 0.2)) / 2, 0, 0, false);
      arm.add(lat);
      const op = kant < 0 ? Math.PI / 2 : -Math.PI / 2;
      arm.rotation.z = op;
      group.add(arm);
      slagbomen.push({ arm, op });
    }
    return { x, z, dicht: false };
  });

  // --- borden: een portaal bij elke afslag, een plaatsnaambord bij elke stad ------
  const bord = (tekst: string, at: Pt, richting: Pt, breed: number, hoog: number, portaal: boolean) => {
    const tex = signTexture(kit, tekst, { bg: "#1d4ed8", fg: "#ffffff", width: 768, height: Math.round((768 * hoog) / breed) });
    const m = kit.own({ map: tex, roughness: 0.6 });
    const plaat = new THREE.Mesh(kit.geo(`nl-bordplaat:${breed}:${hoog}`, () => new THREE.PlaneGeometry(breed, hoog)), m);
    // het bord kijkt het verkeer aan dat eraan komt
    const ry = Math.atan2(-richting[0], -richting[1]);
    const y = portaal ? 5.6 : 2.3;
    plaat.position.set(at[0], y, at[1]);
    plaat.rotation.y = ry;
    vast.add(plaat);
    const achter = kit.box(breed + 0.1, hoog + 0.1, 0.06, grijs, at[0] - Math.sin(ry) * 0.04, y, at[1] - Math.cos(ry) * 0.04, false);
    achter.rotation.y = ry;
    vast.add(achter);
    const rx = -richting[1];
    const rz = richting[0];
    if (portaal) {
      for (const kant of [-1, 1]) vast.add(kit.box(0.3, 6.6, 0.3, grijs, at[0] + rx * kant * (SNELWEG_B / 2 + 1), 3.3, at[1] + rz * kant * (SNELWEG_B / 2 + 1)));
      const balk = kit.box(SNELWEG_B + 2.3, 0.35, 0.35, grijs, at[0], 6.5, at[1], false);
      balk.rotation.y = ry;
      vast.add(balk);
    } else vast.add(kit.box(0.12, 1.9, 0.12, grijs, at[0], 0.95, at[1]));
  };
  bord("Utrecht · Groningen", [170, 24], [1, 0], 7, 1.4, true);
  bord("Amsterdam · Rotterdam", [-170, -24], [-1, 0], 7, 1.4, true);
  for (const s of STEDEN) {
    const route = ROUTES[s.id];
    const b = route[route.length - 1];
    const a = route[route.length - 2];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const u: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    const rechts: Pt = [-u[1], u[0]];
    const at: Pt = [b[0] - u[0] * 16 + rechts[0] * (SNELWEG_B / 2 + 1.4), b[1] - u[1] * 16 + rechts[1] * (SNELWEG_B / 2 + 1.4)];
    bord(s.naam, at, u, 3.2, 0.9, false);
  }

  // --- lantaarns langs de ringwegen ---------------------------------------
  const palen: THREE.Vector3[] = [];
  for (const s of STEDEN) {
    const lus = ringPunten(s.id);
    for (let i = 1; i < lus.length; i++) {
      const a = lus[i - 1];
      const b = lus[i];
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / len;
      const uz = (b[1] - a[1]) / len;
      for (let t = 9; t < len - 6; t += 18) palen.push(new THREE.Vector3(a[0] + ux * t - uz * (RING_B / 2 + 1.6), 0, a[1] + uz * t + ux * (RING_B / 2 + 1.6)));
    }
  }
  const lampKap = kit.own({ color: 0xfff7d6, emissive: 0xffe7b0, emissiveIntensity: 0.1, roughness: 0.4 });
  glows.push({ m: lampKap, day: 0.1, dusk: 1, night: 1.4 });
  const pmesh = kit.track(new THREE.InstancedMesh(kit.geo("nl-lantaarnpaal", () => new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6).translate(0, 2.1, 0)), grijs, Math.max(1, palen.length)));
  const kmesh = kit.track(new THREE.InstancedMesh(kit.geo("nl-lantaarnkap", () => new THREE.SphereGeometry(0.22, 10, 8).translate(0, 4.3, 0)), lampKap, Math.max(1, palen.length)));
  palen.forEach((p, i) => {
    m4.makeTranslation(p.x, 0, p.z);
    pmesh.setMatrixAt(i, m4);
    kmesh.setMatrixAt(i, m4);
  });
  group.add(pmesh, kmesh);

  // --- de panden: baksteen met ramen (en verlichte ramen 's avonds), glas in Rotterdam --
  const alle: Pand[] = STEDEN.flatMap((s) => panden(s.id));
  const huizen = alle.filter((p) => !p.glas);
  const torens = alle.filter((p) => p.glas);
  const gevel = kit.own({ map: win.map, emissive: 0xffffff, emissiveMap: win.lit[1], emissiveIntensity: 0, roughness: 0.85 });
  glows.push({ m: gevel, day: 0, dusk: 0.55, night: 0.9 });
  const glasGevel = kit.own({ map: win.map, emissive: 0xffffff, emissiveMap: win.lit[2], emissiveIntensity: 0, roughness: 0.25, metalness: 0.45 });
  glows.push({ m: glasGevel, day: 0, dusk: 0.5, night: 0.8 });
  // een blok van 1 × 1 × 1 met de onderkant op de grond; een toren krijgt drie keer zoveel verdiepingen in zijn ramen
  const blok = kit.geo("nl-pand", () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  const torenBlok = kit.geo("nl-toren", () => {
    const g = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 3);
    return g;
  });
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  const veel = (geo: THREE.BufferGeometry, m: THREE.Material, lijst: Pand[], plaats: (p: Pand) => void, kleur: (p: Pand) => number) => {
    const mesh = kit.track(new THREE.InstancedMesh(geo, m, Math.max(1, lijst.length)));
    lijst.forEach((p, i) => {
      o.rotation.set(0, 0, 0);
      plaats(p);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, c.setHex(kleur(p)));
    });
    mesh.count = lijst.length;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  const romp = (p: Pand) => {
    o.position.set(p.x, 0, p.z);
    o.scale.set(p.w, p.h, p.d);
  };
  veel(blok, gevel, huizen, romp, (p) => kleurUit(BAKSTEEN, p.kleur));
  veel(torenBlok, glasGevel, torens, romp, (p) => kleurUit(GLAS, p.kleur));
  // puntdaken: de nok dwars op de straat, zoals bij een grachtenpand
  const metDak = huizen.filter((p) => p.dak);
  veel(
    kit.geo("nl-dak", gableGeometry),
    kit.mat(0xffffff, { roughness: 0.85 }),
    metDak,
    (p) => {
      o.position.set(p.x, p.h, p.z);
      o.rotation.set(0, p.ry, 0);
      const span = p.ry ? p.d : p.w;
      o.scale.set(span, Math.min(p.w, p.d) * 0.55, p.ry ? p.w : p.d);
    },
    (p) => kleurUit(DAKPAN, p.kleur),
  );

  bake(kit, vast);

  // --- verkeer: auto's, busjes en een bus heen en weer tussen het kantoor en de steden --
  const autos: { m: Mover; heen: boolean; route: Pt[] }[] = [];
  let n = 0;
  for (const s of STEDEN) {
    const route = ROUTES[s.id];
    for (let k = 0; k < 3; k++) {
      const heen = k % 2 === 0;
      const pad = laneOffset(heen ? route : [...route].reverse(), RIJSTROOK);
      const soort = n % 5 === 2 ? "bestelbus" : n === 7 ? "bus" : "verkeer";
      const { g } = vehicle(kit, soort, shadow, soort === "verkeer" ? { color: kleurUit(TRAFFIC_COLORS, n * 3) } : {});
      group.add(g);
      const m = new Mover(g, pad, SNELHEID, ROAD_TOP);
      // verspreid over de route, niet allemaal tegelijk bij de afrit
      m.step((pathLength(pad) * (k / 3 + 0.1)) / SNELHEID);
      autos.push({ m, heen, route });
      n += 1;
    }
  }

  const update = (dt: number, now: number) => {
    const t = now / 1000;
    // overweg dicht als er een trein dichtbij is (de treinen rijden op dezelfde klok als in nederland.ts)
    let ergensDicht = false;
    for (const k of kruisingen) {
      k.dicht = [treinX(0, t), treinX(1, t)].some((x) => x !== null && Math.abs(x - k.x) < 120);
      ergensDicht ||= k.dicht;
    }
    knipper.emissiveIntensity = ergensDicht ? (Math.floor(now / 450) % 2 === 0 ? 1.8 : 0.15) : 0;
    for (const b of slagbomen) {
      const doel = ergensDicht ? 0 : b.op;
      b.arm.rotation.z += (doel - b.arm.rotation.z) * Math.min(1, dt * 2.2);
    }
    if (reduced) return;
    for (const a of autos) {
      const p = a.m.obj.position;
      const hz = Math.cos(a.m.obj.rotation.y);
      // wachten voor een dichte overweg
      const wacht = kruisingen.some((k) => k.dicht && Math.abs(p.x - k.x) < SNELWEG_B && ((hz > 0.5 && p.z > k.z - 17 && p.z < k.z - 7) || (hz < -0.5 && p.z < k.z + 17 && p.z > k.z + 7)));
      if (wacht) continue;
      if (a.m.step(dt)) {
        // aan het eind keren: eerst naar de andere rijstrook, dan terug
        a.heen = !a.heen;
        a.m.reroute(laneOffset(a.heen ? a.route : [...a.route].reverse(), RIJSTROOK));
        a.m.leg = 0;
      }
    }
  };
  update(0, 0);

  return {
    layer: {
      group,
      pickables: [],
      anchors: [],
      glows,
      dispose: () => {
        group.removeFromParent();
        kit.dispose();
      },
    },
    update,
  };
}
