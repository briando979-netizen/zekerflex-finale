import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Gedeelde bouwstenen voor de 3D-stad: materialen en vormen die vaak terugkomen
// worden één keer gemaakt en gedeeld (minder werk voor de videokaart), plus de
// getekende texturen voor ramen, uithangborden, de lucht en zachte schaduwen.
// Alles wat hier gemaakt wordt, ruimt dispose() weer op.

export type Mat = THREE.MeshStandardMaterial;

export interface Kit {
  mat: (color: number, extra?: Pick<THREE.MeshStandardMaterialParameters, "roughness" | "metalness" | "emissive" | "emissiveIntensity" | "transparent" | "opacity" | "flatShading">) => Mat;
  /** Materiaal dat niet gedeeld wordt (bv. een eigen textuur of gloed die apart verandert). */
  own: (params: THREE.MeshStandardMaterialParameters) => Mat;
  geo: <G extends THREE.BufferGeometry>(key: string, make: () => G) => G;
  box: (w: number, h: number, d: number, m: THREE.Material | THREE.Material[], x: number, y: number, z: number, shadow?: boolean) => THREE.Mesh;
  texture: <T extends THREE.Texture>(t: T) => T;
  /** Iets anders dat bij het opruimen weg moet (bv. een los materiaal). */
  track: <T extends { dispose: () => void }>(t: T) => T;
  /** Kit voor een laag die opnieuw gebouwd kan worden: deelt materialen en vormen, ruimt alleen zijn eigen dingen op. */
  scope: () => Kit;
  dispose: () => void;
}

export function makeKit(parent?: Kit): Kit {
  const mats = new Map<string, Mat>();
  const geos = new Map<string, THREE.BufferGeometry>();
  const owned: { dispose: () => void }[] = [];

  const kit: Kit = {
    mat(color, extra = {}) {
      if (parent) return parent.mat(color, extra);
      const key = `${color}|${extra.roughness ?? ""}|${extra.metalness ?? ""}|${extra.emissive ?? ""}|${extra.emissiveIntensity ?? ""}|${extra.transparent ?? ""}|${extra.opacity ?? ""}|${extra.flatShading ?? ""}`;
      let m = mats.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
        mats.set(key, m);
      }
      return m;
    },
    own(params) {
      const m = new THREE.MeshStandardMaterial({ roughness: 0.8, ...params });
      owned.push(m);
      return m;
    },
    geo(key, make) {
      if (parent) return parent.geo(key, make);
      let g = geos.get(key);
      if (!g) {
        g = make();
        geos.set(key, g);
      }
      return g as ReturnType<typeof make>;
    },
    box(w, h, d, m, x, y, z, shadow = true) {
      const b = new THREE.Mesh(
        kit.geo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)),
        m,
      );
      b.position.set(x, y, z);
      b.castShadow = shadow;
      b.receiveShadow = true;
      return b;
    },
    texture(t) {
      owned.push(t);
      return t;
    },
    track(t) {
      owned.push(t);
      return t;
    },
    scope: () => makeKit(kit),
    dispose() {
      mats.forEach((m) => m.dispose());
      geos.forEach((g) => g.dispose());
      owned.forEach((o) => o.dispose());
      mats.clear();
      geos.clear();
      owned.length = 0;
    },
  };
  return kit;
}

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("geen 2d-canvas");
  return { c, ctx };
};

/**
 * Voeg stilstaande stukjes met hetzelfde materiaal samen tot één vorm: de
 * videokaart tekent dan één keer per materiaal in plaats van per stukje.
 * Aanklikbare groepen blijven apart (hun stukjes worden binnen de groep
 * samengevoegd); wat draait of beweegt (userData.live), doorzichtig is of
 * meerdere materialen heeft, blijft los.
 */
export function bake(kit: Kit, root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<string, { m: THREE.Material; shadow: boolean; meshes: THREE.Mesh[] }>();
  const nested: THREE.Object3D[] = [];
  const visit = (o: THREE.Object3D) => {
    for (const child of o.children) {
      if (child.userData.live) continue;
      if (child.userData.pick) {
        nested.push(child);
        continue;
      }
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && !(child as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(mesh.material) && !(mesh.material as THREE.Material).transparent && mesh.renderOrder === 0) {
        const m = mesh.material as THREE.Material;
        const key = `${m.uuid}|${mesh.castShadow}`;
        const b = buckets.get(key) ?? { m, shadow: mesh.castShadow, meshes: [] };
        b.meshes.push(mesh);
        buckets.set(key, b);
      }
      visit(child);
    }
  };
  visit(root);
  const rel = new THREE.Matrix4();
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const geos = b.meshes.map((mesh) => {
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return g.applyMatrix4(rel.multiplyMatrices(inv, mesh.matrixWorld));
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    b.meshes.forEach((mesh) => mesh.removeFromParent());
    const out = new THREE.Mesh(kit.track(merged), b.m);
    out.castShadow = b.shadow;
    out.receiveShadow = true;
    root.add(out);
  }
  for (const n of nested) bake(kit, n);
}

/** Driehoekig dak of fronton van 1 × 1 × 1: breedte langs x, top omhoog, lengte langs z, onderkant op y = 0. */
export function gableGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0);
  s.lineTo(0.5, 0);
  s.lineTo(0, 1);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
}

/** Kleine voorspelbare toevalsgenerator: dezelfde stad bij elke keer laden. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100_000) / 100_000;
  };
}

/** Getal uit een tekst (bijv. een bedrijfsnaam) voor vaste kleuren per klant. */
export function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Gevel met 4 × 4 ramen per tegel. `map` kleurt de gevel overdag; elk van de
 * drie `lit`-texturen laat 's avonds een ander deel van de ramen branden
 * (weinig, half, veel), zodat drukke panden voller verlicht zijn.
 */
export function windowTextures(kit: Kit) {
  const size = 128;
  const cell = size / 4;
  const day = canvas(size, size);
  day.ctx.fillStyle = "#ffffff";
  day.ctx.fillRect(0, 0, size, size);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      day.ctx.fillStyle = "#7a8aa0";
      day.ctx.fillRect(c * cell + 5, r * cell + 6, cell - 10, cell - 11);
      day.ctx.fillStyle = "rgba(255,255,255,.35)";
      day.ctx.fillRect(c * cell + 5, r * cell + 6, (cell - 10) / 3, cell - 11);
    }
  }
  const map = kit.texture(new THREE.CanvasTexture(day.c));
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;

  const lit = [0.2, 0.5, 0.85].map((share, k) => {
    const rnd = seeded(97 + k * 13);
    const night = canvas(size, size);
    night.ctx.fillStyle = "#000000";
    night.ctx.fillRect(0, 0, size, size);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (rnd() > share) continue;
        night.ctx.fillStyle = rnd() > 0.3 ? "#ffd27a" : "#cfe6ff";
        night.ctx.fillRect(c * cell + 5, r * cell + 6, cell - 10, cell - 11);
      }
    }
    const t = kit.texture(new THREE.CanvasTexture(night.c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }) as [THREE.CanvasTexture, THREE.CanvasTexture, THREE.CanvasTexture];

  return { map, lit };
}

/** Een kopie van een (raam)textuur met een eigen herhaling; de afbeelding zelf wordt gedeeld. */
export function repeated(kit: Kit, t: THREE.Texture, x: number, y: number) {
  const c = kit.texture(t.clone());
  c.repeat.set(x, y);
  c.needsUpdate = true;
  return c;
}

/** Uithangbord met tekst. */
export function signTexture(kit: Kit, text: string, opts: { bg: string; fg: string; width?: number; height?: number; font?: string }) {
  const w = opts.width ?? 512;
  const h = opts.height ?? 128;
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = opts.fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let px = Math.round(h * 0.56);
  const family = opts.font ?? "600 {px}px system-ui, -apple-system, 'Segoe UI', sans-serif";
  ctx.font = family.replace("{px}", String(px));
  while (ctx.measureText(text).width > w * 0.9 && px > 12) {
    px -= 2;
    ctx.font = family.replace("{px}", String(px));
  }
  ctx.fillText(text, w / 2, h / 2 + 2);
  const t = kit.texture(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Zachte ronde schaduw onder alles wat beweegt (goedkoper dan echte schaduwen per beeld). */
export function blobTexture(kit: Kit) {
  const { c, ctx } = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, "rgba(15,23,42,.45)");
  g.addColorStop(1, "rgba(15,23,42,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return kit.texture(new THREE.CanvasTexture(c));
}

/** Lucht als verloop van boven naar onder; opnieuw tekenen als het dagdeel verandert. */
export function skyTexture(kit: Kit) {
  const { c, ctx } = canvas(4, 256);
  const t = kit.texture(new THREE.CanvasTexture(c));
  t.colorSpace = THREE.SRGBColorSpace;
  const paint = (top: string, bottom: string) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    t.needsUpdate = true;
  };
  return { texture: t, paint };
}
