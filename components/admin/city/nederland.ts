import * as THREE from "three";
import type { Phase } from "@/lib/admin/city-life";
import { CANAL_Z } from "@/lib/admin/city-layout";
import { bake, gableGeometry, type Kit, seeded, signTexture } from "@/components/admin/city/parts";
import type { Anchor, Glow, Layer } from "@/components/admin/city/world";

// Nederland rond de 3D-stad (13 nov 2026, eigenaar: "net als Nederland: Amsterdam, Groningen, verschillende steden,
// een treinstation, winkels met mensen die daar shoppen"). Over de gracht ligt een loopbrug naar een winkelstraat met
// het station in het midden; achter het station rijden gele treinen af en aan. Aan de horizon liggen vier echte steden,
// elk met hun bekendste baken: Amsterdam (grachtenpanden en de Westertoren), Rotterdam (hoge torens en de Erasmusbrug),
// Utrecht (de Domtoren) en Groningen (de Martinitoren). Alles is eigen geometrie: niets van buiten.

/** Midden van de winkelstraat (oost-west), net ten zuiden van de gracht. */
export const STRAAT_Z = 94;
/** De twee sporen achter het station, en hoe ver de lijn doorloopt naar de andere steden. */
export const SPOREN: readonly [number, number] = [116.5, 119];
export const SPOOR_EIND = 700;
/** Een treinrit: binnenrijden, stilstaan aan het perron, vertrekken, en even weg (seconden). */
export const RIT = { in: 38, stil: 24, uit: 38, weg: 50 } as const;
const RIT_DUUR = RIT.in + RIT.stil + RIT.uit + RIT.weg;

/** Steden aan de horizon (x, z en de naam op het bordje). */
export const STEDEN = [
  { id: "amsterdam", naam: "Amsterdam", x: -430, z: 150 },
  { id: "rotterdam", naam: "Rotterdam", x: -300, z: 430 },
  { id: "utrecht", naam: "Utrecht", x: 300, z: 430 },
  { id: "groningen", naam: "Groningen", x: 430, z: 150 },
] as const;

/** Winkels in de straat: gewone soorten, geen echte merken. */
export const WINKELS = ["Bakker", "Boekhandel", "Fietsen", "Kaas", "Bloemen", "Mode", "Drogist", "Koffie", "Speelgoed", "Schoenen", "Groente", "Optiek"] as const;

/**
 * Waar staat de trein op spoor `spoor` op tijdstip t (seconden)? x langs de lijn, of null als hij weg is. Spoor 0 komt
 * uit het westen (Amsterdam) en rijdt door naar het oosten (Groningen); spoor 1 andersom, een halve rit later.
 * Remmen en optrekken gaan zacht (kwadratisch), zodat hij aan het perron tot stilstand komt.
 */
export function treinX(spoor: 0 | 1, t: number): number | null {
  const fase = (((t + (spoor === 1 ? RIT_DUUR / 2 : 0)) % RIT_DUUR) + RIT_DUUR) % RIT_DUUR;
  const richting = spoor === 0 ? 1 : -1;
  let x: number;
  if (fase < RIT.in) {
    const k = fase / RIT.in;
    x = -SPOOR_EIND * (1 - k) ** 2;
  } else if (fase < RIT.in + RIT.stil) {
    x = 0;
  } else if (fase < RIT.in + RIT.stil + RIT.uit) {
    const k = (fase - RIT.in - RIT.stil) / RIT.uit;
    x = SPOOR_EIND * k ** 2;
  } else return null;
  return x * richting;
}

/** Hoeveel winkelende mensen er lopen: overdag druk, 's avonds minder, 's nachts bijna niemand. */
export function winkelendePublieksgrootte(phase: Phase, max: number): number {
  return Math.round(max * (phase === "dag" ? 1 : phase === "schemer" ? 0.55 : 0.12));
}

export interface Nederland {
  layer: Layer;
  update: (dt: number, now: number, phase: Phase) => void;
}

const BAKSTEEN = [0x9a4a32, 0x7c3a28, 0xb4643f, 0x8b5e3c, 0x6b3f2a, 0xc7a17a, 0xd8cbb3, 0x5b4636] as const;
const LUIFEL = [0x0f766e, 0xb91c1c, 0x1d4ed8, 0xca8a04, 0x15803d, 0x7c3aed] as const;
const JASSEN = [0x1f2937, 0x7f1d1d, 0x1e3a8a, 0x365314, 0x78350f, 0x6b7280, 0xbe185d, 0x0e7490, 0xf59e0b, 0xe5e7eb] as const;
const pick = (lijst: readonly number[], r: number, standaard: number): number => lijst[Math.floor(r * lijst.length)] ?? standaard;

export function buildNederland(root: Kit, reduced: boolean): Nederland {
  const kit = root.scope();
  const group = new THREE.Group();
  const vast = new THREE.Group();
  group.add(vast);
  const anchors: Anchor[] = [];
  const glows: Glow[] = [];
  const rnd = seeded(1313);
  const [, kade] = CANAL_Z;

  const plat = (w: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const p = new THREE.Mesh(kit.geo(`nl-plat:${w}:${d}`, () => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)), m);
    p.position.set(x, y, z);
    p.receiveShadow = true;
    return p;
  };
  const glas = kit.mat(0x8fb3c9, { roughness: 0.08, metalness: 0.65 });
  const steen = kit.mat(0xd6d3d1, { roughness: 0.95 });
  const donker = kit.mat(0x1f2937, { roughness: 0.6 });

  // --- loopbrug over de gracht en de winkelstraat ---------------------------
  const brugVan = 74;
  const brugTot = kade + 3;
  vast.add(kit.box(3.2, 0.3, brugTot - brugVan, kit.mat(0x8b8178, { roughness: 0.9 }), 0, 0.55, (brugVan + brugTot) / 2));
  for (const x of [-1.5, 1.5]) vast.add(kit.box(0.08, 0.9, brugTot - brugVan, donker, x, 1.15, (brugVan + brugTot) / 2, false));
  vast.add(plat(140, 9, steen, 0, 0.04, STRAAT_Z));
  // bankjes en bomen langs de kadekant
  for (let x = -60; x <= 60; x += 12) {
    if (Math.abs(x) < 4) continue;
    vast.add(kit.box(1.8, 0.45, 0.5, kit.mat(0x78716c), x, 0.3, STRAAT_Z - 3.6));
    const stam = kit.box(0.25, 2.2, 0.25, kit.mat(0x5b4636), x + 5, 1.1, STRAAT_Z - 3.8);
    const kruin = new THREE.Mesh(kit.geo("nl-kruin", () => new THREE.SphereGeometry(1.4, 10, 8)), kit.mat(0x4d7c3f, { roughness: 0.9 }));
    kruin.position.set(x + 5, 2.9, STRAAT_Z - 3.8);
    kruin.castShadow = true;
    vast.add(stam, kruin);
  }

  // --- winkels: smalle Hollandse panden met een etalage, luifel en uithangbord ---
  const gevel = STRAAT_Z + 3.6;
  // etalages: licht van binnen, 's avonds feller (één materiaal voor alle winkels)
  const etalage = kit.own({ color: 0xfff4d6, emissive: 0xffe7b0, emissiveIntensity: 0.25, roughness: 0.4 });
  glows.push({ m: etalage, day: 0.25, dusk: 0.9, night: 1.3 });
  let winkel = 0;
  for (const kant of [-1, 1] as const) {
    let x = kant * 20;
    while (Math.abs(x) < 64) {
      const w = 6 + Math.round(rnd() * 2);
      const h = 7 + Math.round(rnd() * 5);
      const d = 9;
      const cx = x + (kant * w) / 2;
      const body = kit.mat(pick(BAKSTEEN, rnd(), 0x9a4a32), { roughness: 0.9 });
      vast.add(kit.box(w, h, d, body, cx, h / 2, gevel + d / 2));
      const dak = new THREE.Mesh(kit.geo("nl-gevel", gableGeometry), kit.mat(0x3f3a36, { roughness: 0.9, flatShading: true }));
      dak.scale.set(w, 2.6, d);
      dak.position.set(cx, h, gevel + d / 2);
      dak.castShadow = true;
      vast.add(dak);
      // ramen op de verdiepingen: donker glas dat de lucht weerspiegelt
      for (let y = 4.2; y < h - 1; y += 2.6) for (const dx of [-w / 4, w / 4]) vast.add(kit.box(1.1, 1.5, 0.08, glas, cx + dx, y, gevel - 0.02, false));
      const raam = new THREE.Mesh(kit.geo(`nl-etalage:${w}`, () => new THREE.PlaneGeometry(w - 1.2, 2.2)), etalage);
      raam.position.set(cx, 1.5, gevel - 0.03);
      raam.rotation.y = Math.PI;
      vast.add(raam);
      const luifel = kit.box(w - 0.6, 0.08, 1.6, kit.mat(pick(LUIFEL, rnd(), 0x0f766e), { roughness: 0.8 }), cx, 2.9, gevel - 0.8, false);
      luifel.rotation.x = -0.28;
      vast.add(luifel);
      const naam = WINKELS[winkel % WINKELS.length] ?? "Winkel";
      winkel += 1;
      const tex = signTexture(kit, naam, { bg: "#fafaf9", fg: "#1c1917", width: 512, height: 128 });
      const bordMat = kit.own({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.1, roughness: 0.6 });
      glows.push({ m: bordMat, day: 0.1, dusk: 0.5, night: 0.8 });
      const bord = new THREE.Mesh(kit.geo(`nl-bord:${w}`, () => new THREE.PlaneGeometry(Math.min(w - 1.5, 4.2), 1.05)), bordMat);
      bord.position.set(cx, 3.6, gevel - 0.06);
      bord.rotation.y = Math.PI;
      vast.add(bord);
      x += kant * (w + 0.2);
    }
  }

  // --- het station: glazen hal met een boogdak, klokkentoren en perrons --------
  const hz = gevel + 6;
  vast.add(kit.box(28, 1.2, 12, kit.mat(0x7c3a28, { roughness: 0.9 }), 0, 0.6, hz));
  vast.add(kit.box(28, 7, 0.2, glas, 0, 4.7, hz - 6, false));
  vast.add(kit.box(0.2, 7, 12, glas, -14, 4.7, hz, false), kit.box(0.2, 7, 12, glas, 14, 4.7, hz, false));
  const boog = new THREE.Mesh(
    kit.geo("nl-boog", () => new THREE.CylinderGeometry(7, 7, 28, 24, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2)),
    kit.mat(0x94a3b8, { roughness: 0.35, metalness: 0.7, flatShading: false }),
  );
  boog.position.set(0, 8.2, hz);
  boog.castShadow = true;
  vast.add(boog);
  const stationTex = signTexture(kit, "Station", { bg: "#1e3a8a", fg: "#ffffff", width: 512, height: 128 });
  const stationBord = kit.own({ map: stationTex, emissive: 0xffffff, emissiveMap: stationTex, emissiveIntensity: 0.2, roughness: 0.5 });
  glows.push({ m: stationBord, day: 0.2, dusk: 0.7, night: 1 });
  const stationNaam = new THREE.Mesh(kit.geo("nl-stationbord", () => new THREE.PlaneGeometry(10, 2.5)), stationBord);
  stationNaam.position.set(0, 9.4, hz - 6.25);
  stationNaam.rotation.y = Math.PI;
  vast.add(stationNaam);
  // klokkentoren naast de hal, met een witte wijzerplaat naar de straat
  const torenX = 16.6;
  vast.add(kit.box(3.4, 17, 3.4, kit.mat(0x7c3a28, { roughness: 0.9 }), torenX, 8.5, hz - 3));
  const wijzer = kit.own({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.4 });
  glows.push({ m: wijzer, day: 0.15, dusk: 0.8, night: 1.1 });
  const klok = new THREE.Mesh(kit.geo("nl-klok", () => new THREE.CircleGeometry(1.25, 24)), wijzer);
  klok.position.set(torenX, 14.5, hz - 4.72);
  klok.rotation.y = Math.PI;
  vast.add(klok);
  const spits = new THREE.Mesh(kit.geo("nl-spits", () => new THREE.ConeGeometry(2.4, 4, 4).rotateY(Math.PI / 4)), kit.mat(0x334155, { flatShading: true }));
  spits.position.set(torenX, 19, hz - 3);
  vast.add(spits);
  anchors.push({ key: "nl:station", text: "Station", pos: new THREE.Vector3(0, 13, hz), tier: "landmark" });

  // perrons met overkapping, en de sporen die doorlopen naar de andere steden
  const [spoorA, spoorB] = SPOREN;
  const perronZ = [spoorA - 2.6, spoorB + 2.6];
  for (const pz of perronZ) {
    vast.add(kit.box(120, 0.8, 2.6, kit.mat(0xa8a29e, { roughness: 0.95 }), 0, 0.4, pz));
    vast.add(kit.box(80, 0.15, 3.2, kit.mat(0x475569, { metalness: 0.4, roughness: 0.5 }), 0, 4.2, pz));
    for (let x = -36; x <= 36; x += 12) vast.add(kit.box(0.2, 3.4, 0.2, donker, x, 2.5, pz, false));
  }
  const ballast = kit.mat(0x57534e, { roughness: 1 });
  const staal = kit.mat(0x9ca3af, { metalness: 0.9, roughness: 0.35 });
  for (const sz of SPOREN) {
    vast.add(plat(SPOOR_EIND * 2, 2.6, ballast, 0, 0.03, sz));
    for (const dz of [-0.72, 0.72]) vast.add(kit.box(SPOOR_EIND * 2, 0.12, 0.08, staal, 0, 0.12, sz + dz, false));
  }

  // --- vier steden aan de horizon ---------------------------------------------
  const toren = (x: number, z: number, hoogte: number, breed: number, m: THREE.Material) => vast.add(kit.box(breed, hoogte, breed, m, x, hoogte / 2, z));
  const spitsOp = (x: number, z: number, y: number, r: number, h: number, m: THREE.Material) => {
    const s = new THREE.Mesh(kit.geo(`nl-spitsop:${r}:${h}`, () => new THREE.ConeGeometry(r, h, 8)), m);
    s.position.set(x, y + h / 2, z);
    vast.add(s);
  };
  const leisteen = kit.mat(0x334155, { roughness: 0.8 });
  for (const s of STEDEN) {
    let top = 30;
    if (s.id === "amsterdam") {
      // grachtenpanden met trapgevels, in twee rijen langs een gracht, en de Westertoren
      for (let i = 0; i < 18; i++) {
        const rij = i % 2 === 0 ? -6 : 6;
        const x = s.x - 36 + Math.floor(i / 2) * 8;
        const h = 11 + rnd() * 5;
        const m = kit.mat(pick(BAKSTEEN, rnd(), 0x7c3a28), { roughness: 0.9 });
        vast.add(kit.box(5, h, 7, m, x, h / 2, s.z + rij));
        vast.add(kit.box(3, 1.6, 7, m, x, h + 0.8, s.z + rij), kit.box(1.4, 1.4, 7, m, x, h + 2.3, s.z + rij));
      }
      vast.add(plat(80, 5, kit.mat(0x3d7fb8, { roughness: 0.15, metalness: 0.3 }), s.x, 0.05, s.z));
      toren(s.x + 40, s.z, 34, 5, kit.mat(0x7c3a28, { roughness: 0.9 }));
      spitsOp(s.x + 40, s.z, 34, 2.2, 12, kit.mat(0x1e3a8a));
      top = 50;
    } else if (s.id === "rotterdam") {
      // hoge glazen torens, de Maas en de Erasmusbrug met zijn witte, scheve pyloon
      const toren1 = kit.mat(0x64748b, { roughness: 0.15, metalness: 0.7 });
      for (const [dx, dz, h] of [[-30, -18, 70], [-14, -22, 90], [4, -16, 62], [20, -24, 110], [36, -14, 78], [-40, 0, 48]] as const) toren(s.x + dx, s.z + dz, h, 9, toren1);
      vast.add(plat(220, 26, kit.mat(0x3d7fb8, { roughness: 0.15, metalness: 0.3 }), s.x, 0.05, s.z + 18));
      const wit = kit.mat(0xf8fafc, { roughness: 0.4, metalness: 0.3 });
      vast.add(kit.box(4, 1.2, 60, wit, s.x + 10, 5, s.z + 18));
      const pyloon = kit.box(2.2, 62, 2.2, wit, s.x + 10, 34, s.z + 4);
      pyloon.rotation.x = 0.28;
      vast.add(pyloon);
      const kabels = new THREE.BufferGeometry().setFromPoints(
        [0.2, 0.35, 0.5, 0.65, 0.8].flatMap((k) => [new THREE.Vector3(s.x + 10, 60, s.z - 4), new THREE.Vector3(s.x + 10, 5.6, s.z + 18 + (k - 0.5) * 50)]),
      );
      vast.add(new THREE.LineSegments(kit.track(kabels), kit.track(new THREE.LineBasicMaterial({ color: 0xe2e8f0 }))));
      top = 118;
    } else if (s.id === "utrecht") {
      // de Domtoren: vierkante romp, een achtkantige lantaarn en een spits, tussen lage huizen
      for (let i = 0; i < 12; i++) toren(s.x - 30 + (i % 6) * 11, s.z - 10 + Math.floor(i / 6) * 22, 8 + rnd() * 5, 7, kit.mat(pick(BAKSTEEN, rnd(), 0x8b5e3c), { roughness: 0.9 }));
      const dom = kit.mat(0xb8a68a, { roughness: 0.9 });
      toren(s.x, s.z, 40, 10, dom);
      const lantaarn = new THREE.Mesh(kit.geo("nl-lantaarn", () => new THREE.CylinderGeometry(4, 4.6, 14, 8)), dom);
      lantaarn.position.set(s.x, 47, s.z);
      vast.add(lantaarn);
      spitsOp(s.x, s.z, 54, 2.4, 9, leisteen);
      top = 70;
    } else {
      // Groningen: de Martinitoren, in afnemende lagen met een spits, tussen lage panden
      for (let i = 0; i < 12; i++) toren(s.x - 30 + (i % 6) * 11, s.z - 10 + Math.floor(i / 6) * 22, 8 + rnd() * 6, 7, kit.mat(pick(BAKSTEEN, rnd(), 0x6b3f2a), { roughness: 0.9 }));
      const martini = kit.mat(0x9a6b4f, { roughness: 0.9 });
      toren(s.x, s.z, 22, 9, martini);
      vast.add(kit.box(7, 14, 7, martini, s.x, 29, s.z), kit.box(5, 10, 5, martini, s.x, 41, s.z));
      spitsOp(s.x, s.z, 46, 2.2, 12, kit.mat(0x14532d));
      top = 64;
    }
    anchors.push({ key: `nl:${s.id}`, text: s.naam, pos: new THREE.Vector3(s.x, top, s.z), tier: "landmark" });
  }
  bake(kit, vast);

  // --- treinen: geel met een donkere ramenstrook, vier rijtuigen --------------
  const geel = kit.mat(0xf2c200, { roughness: 0.45, metalness: 0.15 });
  const raamband = kit.mat(0x1f2937, { roughness: 0.15, metalness: 0.6 });
  const dakGrijs = kit.mat(0x6b7280, { roughness: 0.6 });
  const treinen = SPOREN.map((sz) => {
    const t = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const dx = (i - 1.5) * 20.6;
      t.add(kit.box(20, 3.6, 2.8, geel, dx, 2.4, 0, false), kit.box(20.02, 0.9, 2.84, raamband, dx, 3.1, 0, false), kit.box(19.6, 0.3, 2.6, dakGrijs, dx, 4.35, 0, false));
    }
    t.position.set(0, 0, sz);
    t.visible = false;
    group.add(t);
    return t;
  });

  // --- winkelend publiek: één vorm per lichaamsdeel voor iedereen (instancing) --
  const MAX = 44;
  const lijf = new THREE.InstancedMesh(kit.geo("nl-lijf", () => new THREE.CylinderGeometry(0.22, 0.26, 1.15, 8)), kit.own({ roughness: 0.8 }), MAX);
  const hoofd = new THREE.InstancedMesh(kit.geo("nl-hoofd", () => new THREE.SphereGeometry(0.17, 10, 8)), kit.mat(0xe0b494, { roughness: 0.7 }), MAX);
  const tas = new THREE.InstancedMesh(kit.geo("nl-tas", () => new THREE.BoxGeometry(0.32, 0.36, 0.12)), kit.own({ roughness: 0.7 }), MAX);
  for (const m of [lijf, hoofd, tas]) {
    m.castShadow = false;
    m.frustumCulled = false;
    group.add(m);
  }
  const kleur = new THREE.Color();
  const mensen = Array.from({ length: MAX }, (_, i) => {
    kleur.setHex(pick(JASSEN, rnd(), 0x1f2937));
    lijf.setColorAt(i, kleur);
    kleur.setHex(pick(LUIFEL, rnd(), 0xb91c1c));
    tas.setColorAt(i, kleur);
    return { x: -60 + rnd() * 120, z: STRAAT_Z - 2.4 + rnd() * 4.8, dir: rnd() < 0.5 ? -1 : 1, v: 0.8 + rnd() * 0.6, rust: 0, tas: rnd() < 0.55, fase: rnd() * 6 };
  });
  for (const m of [lijf, tas]) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  const mat4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s1 = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();

  const update = (dt: number, now: number, phase: Phase) => {
    const t = now / 1000;
    treinen.forEach((trein, i) => {
      const x = reduced ? 0 : treinX(i === 0 ? 0 : 1, t);
      trein.visible = x !== null;
      if (x !== null) trein.position.x = x;
    });
    const n = winkelendePublieksgrootte(phase, MAX);
    lijf.count = n;
    hoofd.count = n;
    tas.count = n;
    for (let i = 0; i < n; i++) {
      const p = mensen[i];
      if (!p) continue;
      if (!reduced) {
        if (p.rust > 0) p.rust -= dt;
        else {
          p.x += p.dir * p.v * dt;
          // even stilstaan voor een etalage, en omkeren aan het eind van de straat
          if (Math.random() < dt * 0.04) p.rust = 2 + Math.random() * 6;
          if (Math.abs(p.x) > 62) p.dir = p.x > 0 ? -1 : 1;
        }
      }
      const loopt = p.rust <= 0 && !reduced;
      const op = loopt ? Math.abs(Math.sin(t * 6 + p.fase)) * 0.05 : 0;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      mat4.compose(pos.set(p.x, 0.62 + op, p.z), q, s1);
      lijf.setMatrixAt(i, mat4);
      mat4.compose(pos.set(p.x, 1.38 + op, p.z), q, s1);
      hoofd.setMatrixAt(i, mat4);
      mat4.compose(pos.set(p.x, p.tas ? 0.75 + op : -5, p.z + 0.3), q, s1);
      tas.setMatrixAt(i, mat4);
    }
    for (const m of [lijf, hoofd, tas]) m.instanceMatrix.needsUpdate = true;
  };
  update(0, 0, "dag");

  return {
    layer: {
      group,
      pickables: [],
      anchors,
      glows,
      dispose: () => {
        group.removeFromParent();
        kit.dispose();
      },
    },
    update,
  };
}
