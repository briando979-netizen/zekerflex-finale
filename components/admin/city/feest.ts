import * as THREE from "three";
import { fireworksOn } from "@/lib/admin/city-life";
import type { SeasonId } from "@/lib/seasons/calendar";
import { type Kit, seeded } from "@/components/admin/city/parts";

// Feestdagen in de 3D-stad, op de Nederlandse kalender (lib/seasons/calendar):
// oranje vlaggenlijnen op Koningsdag, een verlichte kerstboom op het
// kantoorplein met Kerst, en vuurwerk boven de stad rond de jaarwisseling.
// Op andere dagen bouwt dit niets.

const GROUND = 0.17; // bovenkant van het kantoorplein
const BURSTS = 10;
const PER_BURST = 70;

export interface Festive {
  update: (dt: number, now: number, hour: number, dark: boolean) => void;
  dispose: () => void;
}

export function createFestive(root: Kit, scene: THREE.Scene, holiday: SeasonId | null): Festive {
  const kit = root.scope();
  const group = new THREE.Group();
  scene.add(group);
  const rnd = seeded(31);
  const c = new THREE.Color();
  const o = new THREE.Object3D();

  if (holiday === "koningsdag") {
    // vlaggenlijnen langs de voor- en achterkant van het kantoorplein, licht doorhangend
    const colors = [0xae1c28, 0xffffff, 0x21468b, 0xf97316];
    const flags: { x: number; y: number; z: number }[] = [];
    for (const z of [21.4, -21.4]) {
      for (let x = -20; x <= 20; x += 0.9) flags.push({ x, y: 3.4 - 0.9 * (1 - (x / 20) ** 2), z });
    }
    const mesh = kit.track(new THREE.InstancedMesh(
      kit.geo("vlaggetje", () => new THREE.ConeGeometry(0.24, 0.5, 3).rotateX(Math.PI)),
      kit.mat(0xffffff, { roughness: 0.7 }),
      flags.length,
    ));
    flags.forEach((f, k) => {
      o.position.set(f.x, f.y, f.z);
      o.updateMatrix();
      mesh.setMatrixAt(k, o.matrix);
      mesh.setColorAt(k, c.setHex(colors[k % colors.length] ?? 0xf97316));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
    for (const x of [-20.6, 20.6]) for (const z of [21.4, -21.4]) {
      const pole = kit.box(0.1, 3.6, 0.1, kit.mat(0xe2e8f0, { metalness: 0.4, roughness: 0.4 }), x, GROUND + 1.8, z);
      group.add(pole);
    }
  }

  let twinkle: THREE.MeshBasicMaterial | null = null;
  if (holiday === "kerst") {
    // kerstboom op de hoek van het kantoorplein, met lichtjes en een piek
    const [tx, tz] = [19.4, 15.8];
    const green = kit.mat(0x14532d, { roughness: 0.9, flatShading: true });
    group.add(kit.box(0.3, 0.8, 0.3, kit.mat(0x78350f), tx, GROUND + 0.4, tz));
    [
      [1.6, 1.8, 1.5],
      [1.25, 1.6, 2.6],
      [0.85, 1.4, 3.6],
    ].forEach(([r, h, y], k) => {
      const cone = new THREE.Mesh(kit.geo(`kerst-${k}`, () => new THREE.ConeGeometry(r ?? 1, h ?? 1, 9)), green);
      cone.position.set(tx, GROUND + (y ?? 1), tz);
      cone.castShadow = true;
      group.add(cone);
    });
    const star = new THREE.Mesh(
      kit.geo("piek", () => new THREE.OctahedronGeometry(0.3)),
      kit.track(new THREE.MeshBasicMaterial({ color: 0xfde047 })),
    );
    star.position.set(tx, GROUND + 4.5, tz);
    group.add(star);
    twinkle = kit.track(new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const lights = kit.track(new THREE.InstancedMesh(kit.geo("lampje", () => new THREE.SphereGeometry(0.08, 6, 4)), twinkle, 36));
    for (let k = 0; k < 36; k++) {
      const y = 0.9 + rnd() * 3.2;
      const r = Math.max(0.2, 1.6 * (1 - (y - 0.6) / 3.8)) + 0.05;
      const a = rnd() * Math.PI * 2;
      o.position.set(tx + Math.cos(a) * r, GROUND + y, tz + Math.sin(a) * r);
      o.updateMatrix();
      lights.setMatrixAt(k, o.matrix);
      lights.setColorAt(k, c.setHex([0xef4444, 0xfde047, 0xffffff, 0x60a5fa][k % 4] ?? 0xffffff));
    }
    lights.computeBoundingSphere();
    group.add(lights);
  }

  // vuurwerk: pijlen die boven de stad openspatten, met zwaartekracht en uitdoven
  const fw = holiday === "oudjaar" || holiday === "nieuwjaar";
  const N = fw ? BURSTS * PER_BURST : 1;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const base = new Float32Array(N * 3);
  const geo = kit.track(new THREE.BufferGeometry());
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  const sparks = new THREE.Points(geo, kit.track(new THREE.PointsMaterial({ size: 1.3, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  sparks.frustumCulled = false;
  sparks.visible = false;
  group.add(sparks);
  let next = 0;
  let slot = 0;
  const palette = [0xef4444, 0xfde047, 0x22c55e, 0x60a5fa, 0xf472b6, 0xffffff, 0xf97316];
  const burst = () => {
    const cx = (rnd() - 0.5) * 120;
    const cy = 45 + rnd() * 25;
    const cz = -40 + rnd() * 100;
    c.setHex(palette[Math.floor(rnd() * palette.length)] ?? 0xffffff);
    for (let k = 0; k < PER_BURST; k++) {
      const i = slot * PER_BURST + k;
      const t = rnd() * Math.PI * 2;
      const u = rnd() * 2 - 1;
      const sp = 10 + rnd() * 6;
      const s = Math.sqrt(1 - u * u);
      pos.set([cx, cy, cz], i * 3);
      vel.set([Math.cos(t) * s * sp, u * sp, Math.sin(t) * s * sp], i * 3);
      base.set([c.r, c.g, c.b], i * 3);
      life[i] = 1.8 + rnd() * 0.6;
    }
    slot = (slot + 1) % BURSTS;
  };

  return {
    update(dt, now, hour, dark) {
      if (twinkle) twinkle.color.setScalar(0.75 + 0.25 * Math.sin(now / 260));
      if (!fw) return;
      const on = fireworksOn(holiday, hour, dark);
      sparks.visible = on;
      if (!on) return;
      if (now > next) {
        burst();
        next = now + 500 + rnd() * 900;
      }
      for (let i = 0; i < N; i++) {
        const l = life[i] ?? 0;
        if (l <= 0) {
          col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
          continue;
        }
        life[i] = l - dt;
        vel[i * 3 + 1] = (vel[i * 3 + 1] ?? 0) - 6 * dt;
        for (let a = 0; a < 3; a++) {
          pos[i * 3 + a] = (pos[i * 3 + a] ?? 0) + (vel[i * 3 + a] ?? 0) * dt;
          vel[i * 3 + a] = (vel[i * 3 + a] ?? 0) * (1 - dt * 0.8);
          col[i * 3 + a] = (base[i * 3 + a] ?? 0) * Math.min(1, l / 1.2);
        }
      }
      geo.attributes.position!.needsUpdate = true;
      geo.attributes.color!.needsUpdate = true;
    },
    dispose() {
      group.removeFromParent();
      kit.dispose();
    },
  };
}
