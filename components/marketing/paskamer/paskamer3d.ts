// De 3D-paskamer: een echt mens (MakeHuman, CC0) op jouw maten, met echte
// kleding, haar en huid, studiolicht, zachte schaduw en 360° draaien. Jouw
// gezichtsfoto wordt vanaf de voorkant op het gezicht geprojecteerd en loopt
// zacht over in de huid. Alleen in de browser; de bestanden komen uit
// public/paskamer/3d (scripts/paskamer/bouw-3d.mjs). De rekenkern staat in
// lib/shop/paspop3d/model.ts.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import {
  gezichtsVlak, leesDeel, leesLichaam, lichaamWeergave, lichaamsHoogte, midden, normalen, pasDeel, verbergOnder, vormLichaam, zichtbaar,
  type DeelData, type LichaamData, type Manifest, type Silhouet3D,
} from "@/lib/shop/paspop3d/model";
import type { Accessoire, HaarStijl } from "@/lib/shop/paspop3d/kleding";
import { HAAR_DEEL } from "@/lib/shop/paspop3d/kleding";

const BASIS_URL = "/paskamer/3d";

export type Kleding3D = { deel: string; kleur: string; ruimte: number; laag: number };
export type Extra3D = { soort: Accessoire; kleur: string };
export type Stand3D = {
  silhouet: Silhouet3D;
  lengte: number; // cm
  gewicht: number; // −1 … +1
  huidTextuur: string; // "licht-h" …
  huidKleur: string | null; // hex uit de foto, om de textuur op af te stemmen
  gezicht: string | null; // data-URL
  haar: HaarStijl;
  haarKleur: string;
  oogKleur: "bruin" | "blauw";
  kleding: Kleding3D[];
  extra: Extra3D[];
};

// ---------------------------------------------------------------------------
// Laden (één keer per tabblad, gedeeld via globalThis)
// ---------------------------------------------------------------------------

type Cache = { manifest?: Promise<Manifest>; lichaam?: Promise<LichaamData>; delen: Map<string, Promise<DeelData>>; tex: Map<string, Promise<THREE.Texture>> };
const G = globalThis as unknown as { __zfPaskamer3d?: Cache };
const cache: Cache = (G.__zfPaskamer3d ??= { delen: new Map(), tex: new Map() });

const haalManifest = () => (cache.manifest ??= fetch(`${BASIS_URL}/manifest.json`).then((r) => (r.ok ? (r.json() as Promise<Manifest>) : Promise.reject(new Error("manifest")))));
const haalBin = (bestand: string) => fetch(`${BASIS_URL}/${bestand}`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(bestand))));
const haalLichaam = (m: Manifest) => (cache.lichaam ??= haalBin(m.lichaam.bin).then((b) => leesLichaam(b, m.lichaam)));
function haalDeel(m: Manifest, id: string): Promise<DeelData> {
  const info = m.delen[id];
  if (!info) return Promise.reject(new Error(`onbekend deel ${id}`));
  let p = cache.delen.get(id);
  if (!p) cache.delen.set(id, (p = haalBin(info.bin).then((b) => leesDeel(b, info))));
  return p;
}
function haalTex(bestand: string, kleur: boolean): Promise<THREE.Texture> {
  const sleutel = `${bestand}|${kleur}`;
  let p = cache.tex.get(sleutel);
  if (!p) {
    p = new Promise((ok, fout) =>
      new THREE.TextureLoader().load(
        bestand.startsWith("data:") ? bestand : `${BASIS_URL}/${bestand}`,
        (t) => {
          t.colorSpace = kleur ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          t.anisotropy = 4;
          ok(t);
        },
        undefined,
        fout,
      ),
    );
    if (!bestand.startsWith("data:")) cache.tex.set(sleutel, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Materialen
// ---------------------------------------------------------------------------

/** Huid met de gezichtsfoto (projectie vanaf voren) en geschilderde handschoenen. */
function huidMateriaal(): THREE.MeshPhysicalMaterial & { userData: { u: Record<string, THREE.IUniform> } } {
  const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.58, sheen: 0.35, sheenRoughness: 0.75, sheenColor: new THREE.Color("#ffd6c2"), specularIntensity: 0.35 }) as THREE.MeshPhysicalMaterial & { userData: { u: Record<string, THREE.IUniform> } };
  const u: Record<string, THREE.IUniform> = {
    gzTex: { value: null },
    gzAan: { value: 0 },
    gzMidden: { value: new THREE.Vector2() },
    gzMaat: { value: new THREE.Vector2(1, 1) },
    gzDiepte: { value: 0 },
    hsAan: { value: 0 },
    hsKleur: { value: new THREE.Color("#d8c79c") },
    hsL: { value: new THREE.Vector3() },
    hsR: { value: new THREE.Vector3() },
    hsDirL: { value: new THREE.Vector3(1, 0, 0) },
    hsDirR: { value: new THREE.Vector3(-1, 0, 0) },
  };
  mat.userData.u = u;
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;\nvObjN = normal;");
    s.fragmentShader = s.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vObj; varying vec3 vObjN;
uniform sampler2D gzTex; uniform float gzAan; uniform vec2 gzMidden; uniform vec2 gzMaat; uniform float gzDiepte;
uniform float hsAan; uniform vec3 hsKleur; uniform vec3 hsL; uniform vec3 hsR; uniform vec3 hsDirL; uniform vec3 hsDirR;
float zfHand(vec3 p, vec3 a, vec3 dir) { float t = dot(p - a, dir); vec3 q = a + dir * clamp(t, -0.35, 1.25); return (1.0 - smoothstep(0.62, 0.72, distance(p, q))) * smoothstep(-0.45, -0.25, t); }`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
if (gzAan > 0.5) {
  vec2 fuv = (vObj.xy - gzMidden) / gzMaat + 0.5;
  vec2 e = (fuv - 0.5) * 2.0;
  // het ovaal van de foto: bovenaan tot aan de haarlijn, onderaan tot net onder de kin
  float ell = 1.0 - smoothstep(0.72, 0.98, length(vec2(e.x * 1.06, e.y)));
  float voor = smoothstep(0.15, 0.55, normalize(vObjN).z) * smoothstep(gzDiepte - 0.15, gzDiepte + 0.15, vObj.z);
  vec4 g = texture2D(gzTex, clamp(fuv, 0.0, 1.0));
  diffuseColor.rgb = mix(diffuseColor.rgb, g.rgb, ell * voor);
}
if (hsAan > 0.5) {
  float h = max(zfHand(vObj, hsL, hsDirL), zfHand(vObj, hsR, hsDirR));
  diffuseColor.rgb = mix(diffuseColor.rgb, hsKleur, h);
}`,
      );
  };
  return mat;
}

/** Stof: kleur × detailkaart (plooien, naden), normaalkaart en een zachte stofglans. */
function stofMateriaal(kleur: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(kleur), roughness: 0.86, sheen: 0.55, sheenRoughness: 0.6, sheenColor: new THREE.Color(kleur).lerp(new THREE.Color("#ffffff"), 0.35), side: THREE.DoubleSide });
}

/** Het hesje: fluor met twee reflecterende banden en banden over de schouders. */
function hesjeMateriaal(kleur: string): THREE.MeshPhysicalMaterial & { userData: { u: Record<string, THREE.IUniform> } } {
  const m = stofMateriaal(kleur) as THREE.MeshPhysicalMaterial & { userData: { u: Record<string, THREE.IUniform> } };
  m.emissive = new THREE.Color(kleur).multiplyScalar(0.12);
  const u = { bandA: { value: 4.2 }, bandB: { value: 2.0 }, bandW: { value: 0.22 } };
  m.userData.u = u;
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u);
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vObj;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj; uniform float bandA; uniform float bandB; uniform float bandW;")
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
float zfBand = max(1.0 - smoothstep(bandW * 0.8, bandW, abs(vObj.y - bandA)), 1.0 - smoothstep(bandW * 0.8, bandW, abs(vObj.y - bandB)));
zfBand = max(zfBand, (1.0 - smoothstep(0.16, 0.2, abs(abs(vObj.x) - 0.62))) * step(bandA, vObj.y));
roughnessFactor = mix(roughnessFactor, 0.22, zfBand);`,
      )
      .replace("#include <map_fragment>", "#include <map_fragment>\n{ float zfB = max(1.0 - smoothstep(bandW * 0.8, bandW, abs(vObj.y - bandA)), 1.0 - smoothstep(bandW * 0.8, bandW, abs(vObj.y - bandB))); zfB = max(zfB, (1.0 - smoothstep(0.16, 0.2, abs(abs(vObj.x) - 0.62))) * step(bandA, vObj.y)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.8, 0.82), zfB); }");
  };
  return m;
}

// ---------------------------------------------------------------------------
// De scène
// ---------------------------------------------------------------------------

export type Paskamer3D = {
  zet: (s: Stand3D) => Promise<void>;
  inzoomen: (gezicht: boolean) => void;
  draaien: (aan: boolean) => void;
  /** camera naar een vaste kant: 0 = voor, π/2 = zij, π = achter */
  kijk: (hoek: number) => void;
  foto: () => string;
  stop: () => void;
};

type Onderdeel = { mesh: THREE.Mesh; data: DeelData; id: string };

export async function maakPaskamer3D(houder: HTMLElement, onKlaar?: () => void): Promise<Paskamer3D> {
  const m = await haalManifest();
  const lichaam = await haalLichaam(m);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  // geen schaduwkaarten (die gaven strepen op de vloer); een zachte contactschaduw onder de voeten
  renderer.domElement.style.cssText = "width:100%;height:100%;display:block;touch-action:none;outline:none";
  houder.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight(0xfff8f0, 0xcfc5b8, 0.55));
  const key = new THREE.DirectionalLight(0xfff3e6, 2.2);
  key.position.set(1.6, 3.2, 2.6);
  scene.add(key);
  const rand = new THREE.DirectionalLight(0xdfe9ff, 1.1);
  rand.position.set(-2.2, 2.6, -2.4);
  scene.add(rand);
  const vul = new THREE.DirectionalLight(0xffffff, 0.45);
  vul.position.set(-2.4, 1.4, 2.2);
  scene.add(vul);

  const plateau = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.5, 0.03, 96), new THREE.MeshPhysicalMaterial({ color: "#e4ddd2", roughness: 0.55, clearcoat: 0.25 }));
  plateau.position.y = -0.015;
  scene.add(plateau);
  const schaduwDoek = document.createElement("canvas");
  schaduwDoek.width = schaduwDoek.height = 128;
  const sc = schaduwDoek.getContext("2d");
  if (sc) {
    const grad = sc.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(0.45, "rgba(0,0,0,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    sc.fillStyle = grad;
    sc.fillRect(0, 0, 128, 128);
  }
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(schaduwDoek), transparent: true, depthWrite: false }));
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.002;
  contact.scale.set(0.95, 0.55, 1);
  scene.add(contact);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 60);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minPolarAngle = Math.PI * 0.3;
  controls.maxPolarAngle = Math.PI * 0.56;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.4;
  let rustTimer: ReturnType<typeof setTimeout> | null = null;
  let autoDraai = true;
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    if (rustTimer) clearTimeout(rustTimer);
  });
  controls.addEventListener("end", () => {
    if (rustTimer) clearTimeout(rustTimer);
    rustTimer = setTimeout(() => (controls.autoRotate = autoDraai), 7000);
  });

  // het model in decimeters; de groep schaalt naar de echte lengte in meters
  const groep = new THREE.Group();
  scene.add(groep);
  const huid = huidMateriaal();
  const lichaamGeo = new THREE.BufferGeometry();
  lichaamGeo.setAttribute("uv", new THREE.BufferAttribute(lichaam.uv, 2));
  const lichaamMesh = new THREE.Mesh(lichaamGeo, huid);
  lichaamMesh.castShadow = true;
  lichaamMesh.receiveShadow = true;
  groep.add(lichaamMesh);

  const onderdelen = new Map<string, Onderdeel>();
  const extras = new THREE.Group();
  groep.add(extras);
  let P: Float32Array = new Float32Array(lichaam.basis.length);
  let schaal = 0.1;
  let hoogteM = 1.8;
  let actief = true;

  const resize = () => {
    const w = Math.max(1, houder.clientWidth);
    const h = Math.max(1, houder.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  ro?.observe(houder);
  resize();

  const kader = (gezicht: boolean) => {
    const vfov = (camera.fov * Math.PI) / 180;
    if (gezicht) {
      const doel = new THREE.Vector3(0, hoogteM * 0.9, 0);
      controls.target.copy(doel);
      const d = (hoogteM * 0.22) / Math.tan(vfov / 2);
      camera.position.set(Math.sin(controls.getAzimuthalAngle()) * d, hoogteM * 0.9, Math.cos(controls.getAzimuthalAngle()) * d);
    } else {
      const doel = new THREE.Vector3(0, hoogteM * 0.5, 0);
      controls.target.copy(doel);
      const passend = Math.max(hoogteM * 0.58 / Math.tan(vfov / 2), (hoogteM * 0.36) / (Math.tan(vfov / 2) * camera.aspect));
      const az = controls.getAzimuthalAngle();
      camera.position.set(Math.sin(az) * passend, hoogteM * 0.55, Math.cos(az) * passend);
    }
    controls.minDistance = hoogteM * 0.45;
    controls.maxDistance = hoogteM * 2.6;
    controls.update();
  };

  let laatsteStand: Stand3D | null = null;
  let eerste = true;

  async function zet(s: Stand3D): Promise<void> {
    laatsteStand = s;
    // 1. lichaam vormen en naar de echte lengte schalen
    P = vormLichaam(lichaam, s.silhouet, s.gewicht, P);
    const { min, max } = lichaamsHoogte(lichaam, P);
    hoogteM = s.lengte / 100;
    schaal = hoogteM / (max - min);
    groep.scale.setScalar(schaal);
    groep.position.y = -min * schaal;

    // 2. welke onderdelen: kleding, schoenen, haar, ogen, wenkbrauwen
    const gewenst: { id: string; kleur: string; ruimte: number; laag: number; soort: "stof" | "eigen" | "haar" | "ogen" | "hesje" }[] = [];
    for (const k of s.kleding) gewenst.push({ id: k.deel, kleur: k.kleur, ruimte: k.ruimte, laag: k.laag, soort: k.deel === "hesje" ? "hesje" : m.delen[k.deel]?.kleurbaar ? "stof" : "eigen" });
    if (s.haar !== "geen") gewenst.push({ id: HAAR_DEEL[s.haar], kleur: s.haarKleur, ruimte: 0, laag: 0, soort: "haar" });
    gewenst.push({ id: "ogen", kleur: "#ffffff", ruimte: 0, laag: 0, soort: "ogen" });
    if (!s.gezicht) gewenst.push({ id: "wenkbrauwen", kleur: s.haarKleur, ruimte: 0, laag: 0, soort: "haar" }, { id: "wimpers", kleur: "#ffffff", ruimte: 0, laag: 0, soort: "eigen" });
    const ids = new Set(gewenst.map((g) => g.id));
    for (const [id, o] of onderdelen) if (!ids.has(id)) (groep.remove(o.mesh), o.mesh.geometry.dispose(), onderdelen.delete(id));

    // 3. laden wat ontbreekt (parallel), dan passen op het lichaam
    await Promise.all(
      gewenst.map(async (g) => {
        const info = m.delen[g.id];
        if (!info) return;
        let o = onderdelen.get(g.id);
        if (!o) {
          const data = await haalDeel(m, g.id);
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("uv", new THREE.BufferAttribute(data.uv, 2));
          geo.setIndex(new THREE.BufferAttribute(data.idx, 1));
          const mat =
            g.soort === "hesje" ? hesjeMateriaal(g.kleur) :
            g.soort === "stof" ? stofMateriaal(g.kleur) :
            g.soort === "ogen" ? new THREE.MeshPhysicalMaterial({ roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }) :
            g.soort === "haar" ? new THREE.MeshPhysicalMaterial({ color: new THREE.Color(g.kleur), roughness: 0.55, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(g.kleur).lerp(new THREE.Color("#ffffff"), 0.4), alphaTest: 0.45, alphaToCoverage: true, side: THREE.DoubleSide }) :
            new THREE.MeshPhysicalMaterial({ roughness: 0.6, side: THREE.DoubleSide, alphaTest: 0.4 });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.castShadow = g.soort !== "ogen";
          mesh.receiveShadow = true;
          o = { mesh, data, id: g.id };
          onderdelen.set(g.id, o);
          groep.add(mesh);
          // texturen (los, de vorm staat er al)
          const tx = info.tex;
          const mm = mat as THREE.MeshPhysicalMaterial;
          const laad = async (bestand: string | null | undefined, kleur: boolean) => (bestand ? haalTex(bestand, kleur) : null);
          void Promise.all([
            laad(tx.detail ?? tx.kleur ?? tx.grijs ?? (g.soort === "ogen" ? (s.oogKleur === "blauw" ? tx.blauw : tx.bruin) : null), true),
            laad(tx.normaal, false),
          ]).then(([kaart, normaal]) => {
            if (kaart) mm.map = kaart;
            if (normaal) (mm.normalMap = normaal), (mm.normalScale = new THREE.Vector2(0.8, 0.8));
            mm.needsUpdate = true;
          });
        }
        const mat = o.mesh.material as THREE.MeshPhysicalMaterial;
        if (g.soort === "stof" || g.soort === "hesje" || g.soort === "haar") {
          mat.color.set(g.kleur);
          mat.sheenColor.set(g.kleur).lerp(new THREE.Color("#ffffff"), 0.35);
        }
        const pos = pasDeel(o.data, P, g.ruimte);
        const nrm = normalen(o.data.idx, o.data.naarBron, pos, o.data.refs.length / 3);
        // een buitenste laag een paar millimeter naar buiten, zodat de laag eronder er nergens doorheen prikt
        const uitzet = g.laag >= 2 ? 0.05 + (g.laag - 2) * 0.05 : 0;
        if (uitzet > 0) for (let i = 0; i < pos.length; i++) pos[i] = (pos[i] ?? 0) + (nrm[i] ?? 0) * uitzet;
        if (g.laag >= 2) (mat.polygonOffset = true), (mat.polygonOffsetFactor = -g.laag), (mat.polygonOffsetUnits = -g.laag * 2);
        const geo = o.mesh.geometry;
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
        geo.computeBoundingSphere();
        o.mesh.renderOrder = g.soort === "haar" ? 2 : 1;
      }),
    );

    // 4. huid: textuur, kleur, verborgen stukken onder de kleding
    const huidBestand = m.huid[s.huidTextuur] ?? m.huid["licht-h"];
    if (huidBestand) {
      const t = await haalTex(huidBestand, true);
      if (huid.map !== t) (huid.map = t), (huid.needsUpdate = true);
    }
    const gem = m.huidGem?.[s.huidTextuur];
    if (s.huidKleur && gem) {
      const doel = new THREE.Color(s.huidKleur);
      const bron = new THREE.Color(gem[0] / 255, gem[1] / 255, gem[2] / 255).convertSRGBToLinear();
      const lin = doel.clone().convertSRGBToLinear();
      // voorzichtig bijkleuren (hooguit ±20 %, voor de helft): de huid moet bij de foto passen, niet oranje worden
      const f = (a: number, b: number) => 1 + (Math.max(0.8, Math.min(1.2, a / (b || 1))) - 1) * 0.5;
      huid.color.setRGB(f(lin.r, bron.r), f(lin.g, bron.g), f(lin.b, bron.b), THREE.LinearSRGBColorSpace);
    } else huid.color.set("#ffffff");
    const kledingData = s.kleding.map((k) => onderdelen.get(k.deel)?.data).filter((d): d is DeelData => Boolean(d));
    const verborgen = verbergOnder(lichaam.basis.length / 3, kledingData);
    const lpos = lichaamWeergave(lichaam, P);
    lichaamGeo.setAttribute("position", new THREE.BufferAttribute(lpos, 3));
    lichaamGeo.setAttribute("normal", new THREE.BufferAttribute(normalen(lichaam.idx, lichaam.naarBron, lpos, lichaam.basis.length / 3), 3));
    lichaamGeo.setIndex(new THREE.BufferAttribute(zichtbaar(lichaam, verborgen), 1));
    lichaamGeo.computeBoundingSphere();

    // 5. gezichtsfoto op het hoofd (ook op de ogen, anders kijken er twee paar ogen)
    const ogen = midden(P, [...m.lichaam.ogen.l, ...m.lichaam.ogen.r]);
    const kin = midden(P, [m.lichaam.kin]);
    const u = huid.userData.u;
    const oog = onderdelen.get("ogen");
    if (s.gezicht) {
      const vlak = gezichtsVlak(ogen, kin);
      u.gzTex!.value = await haalTex(s.gezicht, true);
      u.gzAan!.value = 1;
      (u.gzMidden!.value as THREE.Vector2).set(vlak.midden[0], vlak.midden[1]);
      (u.gzMaat!.value as THREE.Vector2).set(vlak.maat[0], vlak.maat[1]);
      u.gzDiepte!.value = ogen[2] - 0.9;
      // de foto heeft al ogen: de oogbollen even iets naar achteren, zodat ze niet door de foto prikken
      if (oog) oog.mesh.visible = false;
    } else {
      u.gzAan!.value = 0;
      if (oog) oog.mesh.visible = true;
    }

    // 6. handschoenen geschilderd op de handen
    const gw = m.lichaam.gewrichten ?? {};
    const hand = (k: "l" | "r") => new THREE.Vector3(...midden(P, gw[`${k}-hand`] ?? []));
    const elleboog = (k: "l" | "r") => new THREE.Vector3(...midden(P, gw[`${k}-elbow`] ?? []));
    const hs = s.extra.find((e) => e.soort === "handschoenen");
    u.hsAan!.value = hs ? 1 : 0;
    if (hs) {
      (u.hsKleur!.value as THREE.Color).set(hs.kleur);
      (u.hsL!.value as THREE.Vector3).copy(hand("l"));
      (u.hsR!.value as THREE.Vector3).copy(hand("r"));
      (u.hsDirL!.value as THREE.Vector3).copy(hand("l").sub(elleboog("l")).normalize());
      (u.hsDirR!.value as THREE.Vector3).copy(hand("r").sub(elleboog("r")).normalize());
    }
    // het hesje: banden op borst- en buikhoogte
    const hes = onderdelen.get("hesje");
    if (hes) {
      const hu = (hes.mesh.material as THREE.MeshPhysicalMaterial & { userData: { u?: Record<string, THREE.IUniform> } }).userData.u;
      const nek = midden(P, gw.neck ?? []);
      const bekken = midden(P, gw.pelvis ?? []);
      if (hu) (hu.bandA!.value = bekken[1] + (nek[1] - bekken[1]) * 0.62), (hu.bandB!.value = bekken[1] + (nek[1] - bekken[1]) * 0.22);
    }

    // 7. helm, pet, bril, kniebeschermers
    bouwExtras(s, P);

    if (eerste) {
      eerste = false;
      kader(false);
      onKlaar?.();
    }
  }

  function bouwExtras(s: Stand3D, Pn: Float32Array) {
    for (const c of [...extras.children]) {
      extras.remove(c);
      (c as THREE.Mesh).geometry?.dispose?.();
    }
    const gw = m.lichaam.gewrichten ?? {};
    const ogen = midden(Pn, [...m.lichaam.ogen.l, ...m.lichaam.ogen.r]);
    const kruin = midden(Pn, [m.lichaam.kruin]);
    const hoofd = midden(Pn, gw.head ?? []);
    const oogL = midden(Pn, m.lichaam.ogen.l);
    const oogR = midden(Pn, m.lichaam.ogen.r);
    const hoofdBreed = Math.max(0.75, Math.abs(oogL[0] - oogR[0]) * 1.55);
    const hoofdMid = new THREE.Vector3(0, (ogen[1] + kruin[1]) / 2 - 0.1, hoofd[2] + 0.05);
    for (const e of s.extra) {
      if (e.soort === "helm" || e.soort === "pet") {
        const helm = e.soort === "helm";
        const r = hoofdBreed * (helm ? 1.13 : 1.03);
        const koepel = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 32, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshPhysicalMaterial(helm ? { color: e.kleur, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15 } : { color: e.kleur, roughness: 0.9, sheen: 0.5, sheenRoughness: 0.6 }));
        koepel.scale.set(1, helm ? 0.86 : 0.72, helm ? 1.16 : 1.1);
        const basisY = ogen[1] + (helm ? 0.42 : 0.5);
        koepel.position.set(0, basisY, hoofdMid.z - 0.05);
        koepel.castShadow = true;
        extras.add(koepel);
        if (helm) {
          const rand = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.18, r * 1.2, 0.06, 64), koepel.material);
          rand.scale.set(1, 1, 1.18);
          rand.position.set(0, basisY, hoofdMid.z - 0.05);
          rand.castShadow = true;
          extras.add(rand);
          const kam = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.09, 12, 64, Math.PI), koepel.material);
          kam.rotation.y = Math.PI / 2;
          kam.scale.set(1, 0.86, 1.14);
          kam.position.set(0, basisY, hoofdMid.z - 0.05);
          extras.add(kam);
        } else {
          const klep = new THREE.Shape();
          klep.absellipse(0, 0, r * 0.82, r * 0.78, Math.PI, 2 * Math.PI, false, 0);
          const klepMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(klep, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(e.kleur).multiplyScalar(0.85), roughness: 0.85 }));
          klepMesh.rotation.x = Math.PI / 2 - 0.12;
          klepMesh.position.set(0, basisY + 0.02, hoofdMid.z - 0.05 + r * 1.02);
          klepMesh.castShadow = true;
          extras.add(klepMesh);
        }
      } else if (e.soort === "bril") {
        const rr = hoofdBreed * 1.02;
        const glas = new THREE.Mesh(
          new THREE.CylinderGeometry(rr, rr, 0.42, 48, 1, true, -1.05, 2.1),
          new THREE.MeshPhysicalMaterial({ color: "#dfeef6", roughness: 0.04, transmission: 0.92, thickness: 0.05, ior: 1.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
        );
        glas.position.set(0, ogen[1] + 0.02, ogen[2] - rr + 0.18);
        extras.add(glas);
        const rand = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.025, 8, 64, 2.1), new THREE.MeshStandardMaterial({ color: "#4a5056", roughness: 0.4 }));
        rand.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 1.05);
        rand.position.set(0, ogen[1] + 0.23, ogen[2] - rr + 0.18);
        extras.add(rand);
      } else if (e.soort === "riem" || e.soort === "tas") {
        // afmetingen van de romp op heuphoogte (zonder de armen)
        const bekken = midden(Pn, gw.pelvis ?? []);
        const yRiem = bekken[1] + 0.55;
        let xm = 0, zmin = Infinity, zmax = -Infinity;
        for (let i = 0; i < Pn.length; i += 3) {
          const x = Pn[i] ?? 0, y = Pn[i + 1] ?? 0, z = Pn[i + 2] ?? 0;
          if (Math.abs(y - yRiem) > 0.12 || Math.abs(x) > 1.7) continue;
          xm = Math.max(xm, Math.abs(x));
          zmin = Math.min(zmin, z);
          zmax = Math.max(zmax, z);
        }
        if (!isFinite(zmin)) continue;
        const zc = (zmin + zmax) / 2;
        if (e.soort === "riem") {
          const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.22, 64, 1, true), new THREE.MeshPhysicalMaterial({ color: e.kleur, roughness: 0.55, clearcoat: 0.3, side: THREE.DoubleSide }));
          band.scale.set(xm + 0.26, 1, (zmax - zmin) / 2 + 0.26);
          band.position.set(0, yRiem, zc);
          band.castShadow = true;
          extras.add(band);
          const gesp = new THREE.Mesh(new RoundedBoxGeometry(0.36, 0.3, 0.07, 3, 0.02), new THREE.MeshPhysicalMaterial({ color: "#c9b27c", metalness: 0.9, roughness: 0.3 }));
          gesp.position.set(0, yRiem, zmax + 0.3);
          extras.add(gesp);
        } else {
          const tas = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.95, 0.42, 4, 0.14), new THREE.MeshPhysicalMaterial({ color: e.kleur, roughness: 0.85, sheen: 0.4 }));
          tas.position.set(-(xm + 0.5), yRiem - 0.4, zc);
          tas.castShadow = true;
          extras.add(tas);
          const sch = midden(Pn, gw["l-shoulder"] ?? []);
          const bocht = new THREE.CatmullRomCurve3([
            new THREE.Vector3(sch[0] - 0.2, sch[1] + 0.25, zc + 0.1),
            new THREE.Vector3(sch[0] * 0.2, (sch[1] + yRiem) / 2 + 0.3, zmax + 0.4),
            new THREE.Vector3(-(xm + 0.45), yRiem + 0.2, zc + 0.3),
            new THREE.Vector3(-(xm + 0.5), yRiem + 0.1, zc),
          ]);
          const riem = new THREE.Mesh(new THREE.TubeGeometry(bocht, 40, 0.045, 8), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(e.kleur).multiplyScalar(0.7), roughness: 0.8 }));
          extras.add(riem);
        }
      } else if (e.soort === "kniebeschermers") {
        for (const k of ["l", "r"] as const) {
          const knie = midden(Pn, gw[`${k}-knee`] ?? []);
          const enkel = midden(Pn, gw[`${k}-ankle`] ?? []);
          const pad = new THREE.Mesh(new RoundedBoxGeometry(0.85, 1.05, 0.38, 4, 0.16), new THREE.MeshPhysicalMaterial({ color: e.kleur, roughness: 0.75 }));
          const richting = new THREE.Vector3(enkel[0] - knie[0], enkel[1] - knie[1], enkel[2] - knie[2]).normalize();
          pad.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), richting);
          pad.position.set(knie[0], knie[1] - 0.05, knie[2] + 0.55);
          pad.castShadow = true;
          extras.add(pad);
        }
      }
    }
  }

  let frame = 0;
  const lus = () => {
    if (!actief) return;
    frame = requestAnimationFrame(lus);
    controls.update();
    renderer.render(scene, camera);
  };
  const zichtbaarheid = () => {
    if (document.hidden) cancelAnimationFrame(frame);
    else if (actief) lus();
  };
  document.addEventListener("visibilitychange", zichtbaarheid);
  lus();

  return {
    zet: (s) => zet(s).catch((e) => console.warn("paskamer3d", e)),
    inzoomen: (gezicht) => kader(gezicht),
    draaien: (aan) => {
      autoDraai = aan;
      controls.autoRotate = aan;
    },
    kijk: (hoek) => {
      const d = camera.position.distanceTo(controls.target);
      const y = camera.position.y;
      camera.position.set(controls.target.x + Math.sin(hoek) * Math.sqrt(Math.max(0, d * d - (y - controls.target.y) ** 2)), y, controls.target.z + Math.cos(hoek) * Math.sqrt(Math.max(0, d * d - (y - controls.target.y) ** 2)));
      controls.update();
    },
    foto: () => {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/png");
    },
    stop: () => {
      actief = false;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", zichtbaarheid);
      ro?.disconnect();
      controls.dispose();
      for (const o of onderdelen.values()) o.mesh.geometry.dispose();
      lichaamGeo.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      void laatsteStand;
    },
  };
}

/** Kan deze browser 3D tonen? Zo niet, dan blijft de tekening staan. */
export function heeftWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
