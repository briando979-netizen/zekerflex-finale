import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { BreinData } from "@/lib/rag/brein";
import { themaKleur } from "@/components/admin/brein/kleuren";

// Het Brein in 3D: elk geheugenstuk (RagChunk) een lichtgevend neuron in één Points-object
// (duizenden in één tekenopdracht), kleur = cluster, grootte groeit met het aantal raadplegingen
// (vuren). Twee indelingen: per bron/thema van de kennisgraaf, of per thema dat het brein zelf
// op betekenis ontdekte; wisselen laat de neuronen naar hun nieuwe plek zweven. Clusters zijn
// wolken die in elkaar overlopen (additieve gloed); per cluster een donker labelkaartje met de
// naam, het aantal neuronen en "vuurt y%" uit de echte telling (of "geen activiteit gemeten").
// Korte stralen tussen opeenvolgende stukken en, helderder, synapsen: echte betekenisverwanten
// uit de embeddings. De camera zweeft langzaam; inzoomen op een cluster laat losse neuronen met
// hun titels zien. Een vraag laat de gebruikte neuronen oplichten (pulserend) en vliegt erheen;
// voeden laat nieuwe neuronen groeien met heldere stralen naar hun verwanten. Alleen echte
// gegevens (lib/rag/brein.ts). Dit bestand laadt three.js en komt alleen op de pagina
// Kennisgraaf, pas als iemand het Brein kiest.

export type Indeling = "bron" | "betekenis";

export interface BreinOpties {
  licht: boolean;
  bloom: boolean;
  lijnen: boolean;
  synapsen: boolean;
  indeling: Indeling;
  minderBeweging: boolean;
  onHover: (id: string | null) => void;
  onKlik: (id: string) => void;
  onVliegtochtStop: () => void;
}

export interface BreinHandle {
  dispose: () => void;
  setBloom: (aan: boolean) => void;
  setLijnen: (aan: boolean) => void;
  setSynapsen: (aan: boolean) => void;
  /** wisselen tussen de indelingen; de neuronen zweven naar hun nieuwe plek */
  setIndeling: (indeling: Indeling) => void;
  /** alleen deze neuronen helder; null = alles */
  setFocus: (ids: Set<string> | null) => void;
  /** treffers van het zoekveld: labels erbij */
  setZoek: (ids: Set<string> | null) => void;
  /** de neuronen die het brein voor een vraag gebruikte: pulserend oplichten, camera erheen; null = uit */
  setOplichten: (ids: string[] | null) => void;
  vliegNaar: (id: string) => void;
  vliegNaarCluster: (index: number) => void;
  vliegtocht: (aan: boolean) => void;
  reset: () => void;
  /** nieuwe gegevens (na voeden): de genoemde neuronen verschijnen groeiend, met stralen naar hun verwanten */
  zetData: (data: BreinData, nieuw?: { ids: string[]; buren: string[] }) => void;
  foto: () => string | null;
}

const ACHTERGROND = 0x04060b;
const MAX_NEURON_LABELS = 14;
const ZWEEF_MS = 2600;

const VERTEX = `
attribute float grootte;
attribute vec3 kleur;
attribute float fase;
uniform float tijd;
varying vec3 vKleur;
void main() {
  vKleur = kleur;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float twinkel = 1.0 + 0.12 * sin(tijd * 1.7 + fase * 6.2831);
  gl_PointSize = clamp(grootte * twinkel * (260.0 / -mv.z), 1.5, 72.0);
  gl_Position = projectionMatrix * mv;
}`;
const FRAGMENT = `
uniform sampler2D kaart;
varying vec3 vKleur;
void main() {
  vec4 t = texture2D(kaart, gl_PointCoord);
  gl_FragColor = vec4(vKleur, 1.0) * t;
}`;

/** Een zachte ronde vlek als textuur voor de neuronen. */
function vlekTextuur(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.75)");
    g.addColorStop(0.6, "rgba(255,255,255,0.18)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function toeval(zaad: number): () => number {
  let a = zaad >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface LijnSet {
  obj: THREE.LineSegments;
  paren: [number, number][];
  basis: Float32Array;
  opacity: number;
}

export function createBrein(host: HTMLDivElement, eerste: BreinData, opties: BreinOpties): BreinHandle {
  const { licht } = opties;
  const breed = () => Math.max(1, host.clientWidth);
  const hoog = () => Math.max(1, host.clientHeight);

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: licht ? "low-power" : "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, licht ? 1 : 2));
  renderer.setSize(breed(), hoog());
  renderer.setClearColor(ACHTERGROND, 1);
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.display = "block";
  renderer.domElement.style.cursor = "grab";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  let straal = Math.max(60, eerste.straal);
  const camera = new THREE.PerspectiveCamera(55, breed() / hoog(), 0.5, straal * 60);
  const startPos = () => new THREE.Vector3(straal * 0.6, straal * 0.7, straal * 2.3);
  camera.position.copy(startPos());

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.minDistance = 3;
  controls.maxDistance = straal * 8;
  controls.autoRotate = !opties.minderBeweging;
  controls.autoRotateSpeed = licht ? 0.25 : 0.4;

  // sterrenhemel ver weg
  const hemelAantal = licht ? 700 : 2400;
  const hemel = new Float32Array(hemelAantal * 3);
  const rh = toeval(20261113);
  for (let i = 0; i < hemelAantal; i++) {
    const u = rh() * 2 - 1;
    const phi = rh() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const d = straal * (8 + rh() * 6);
    hemel.set([s * Math.cos(phi) * d, u * d, s * Math.sin(phi) * d], i * 3);
  }
  const hemelGeo = new THREE.BufferGeometry();
  hemelGeo.setAttribute("position", new THREE.BufferAttribute(hemel, 3));
  const hemelPunten = new THREE.Points(hemelGeo, new THREE.PointsMaterial({ color: 0x8e9ab0, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(hemelPunten);

  // --- neuronen
  const textuur = vlekTextuur();
  const neuronMat = new THREE.ShaderMaterial({
    uniforms: { kaart: { value: textuur }, tijd: { value: 0 } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  let data = eerste;
  let indeling: Indeling = opties.indeling;
  let neuronGeo = new THREE.BufferGeometry();
  let neuronPunten = new THREE.Points(neuronGeo, neuronMat);
  scene.add(neuronPunten);
  const idx = new Map<string, number>();
  let basisGrootte = new Float32Array(0);
  let basisKleurBron = new Float32Array(0);
  let basisKleurBetekenis = new Float32Array(0);
  let posBron = new Float32Array(0);
  let posBetekenis = new Float32Array(0);
  let groei = new Map<number, number>(); // index → starttijd van het verschijnen
  let zweef: { van: Float32Array; naar: Float32Array; start: number } | null = null;
  const clusterKaarten = new Map<string, HTMLDivElement>();
  let lijnSets: LijnSet[] = [];
  let stralenObj: THREE.LineSegments | null = null;

  const labelLaag = document.createElement("div");
  labelLaag.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:inherit";
  host.appendChild(labelLaag);
  const neuronLabels = new Map<string, HTMLDivElement>();

  const kleurVanCluster = (c: number) => new THREE.Color(themaKleur(c + 1));
  const grootteVan = (v: number) => (licht ? 2.2 : 2.8) + Math.min(6, Math.sqrt(v) * 1.1);
  const basisKleur = () => (indeling === "betekenis" && data.ontdekt ? basisKleurBetekenis : basisKleurBron);
  const clusterVan = (i: number) => (indeling === "betekenis" && data.ontdekt ? data.neuronen[i]?.o ?? data.neuronen[i]?.c ?? 0 : data.neuronen[i]?.c ?? 0);
  const positieVan = (i: number): [number, number, number] => {
    const ne = data.neuronen[i];
    if (!ne) return [0, 0, 0];
    return indeling === "betekenis" && ne.q ? ne.q : ne.p;
  };

  const maakLijnen = (paren: [number, number][], opacity: number, mix: number, breedteFactor = 1): LijnSet => {
    const lp = new Float32Array(paren.length * 6);
    const lk = new Float32Array(paren.length * 6);
    const wit = new THREE.Color(0xffffff);
    paren.forEach(([a, b], k) => {
      const pa = positieVan(a);
      const pb = positieVan(b);
      lp.set([...pa, ...pb], k * 6);
      const ka = kleurVanCluster(clusterVan(a)).lerp(wit, mix);
      const kb = kleurVanCluster(clusterVan(b)).lerp(wit, mix);
      lk.set([ka.r, ka.g, ka.b, kb.r, kb.g, kb.b], k * 6);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(lp, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(lk, 3));
    const obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, linewidth: breedteFactor }));
    scene.add(obj);
    return { obj, paren, basis: lk.slice(), opacity };
  };
  const ruimLijnenOp = () => {
    for (const s of lijnSets) {
      scene.remove(s.obj);
      s.obj.geometry.dispose();
      (s.obj.material as THREE.Material).dispose();
    }
    lijnSets = [];
  };

  const bouw = (d: BreinData) => {
    data = d;
    straal = Math.max(60, d.straal);
    controls.maxDistance = straal * 8;
    if (indeling === "betekenis" && !d.ontdekt) indeling = "bron";
    idx.clear();
    const n = d.neuronen.length;
    posBron = new Float32Array(n * 3);
    posBetekenis = new Float32Array(n * 3);
    basisKleurBron = new Float32Array(n * 3);
    basisKleurBetekenis = new Float32Array(n * 3);
    basisGrootte = new Float32Array(n);
    const fase = new Float32Array(n);
    const rf = toeval(7);
    d.neuronen.forEach((ne, i) => {
      idx.set(ne.id, i);
      posBron.set(ne.p, i * 3);
      posBetekenis.set(ne.q ?? ne.p, i * 3);
      const helder = ne.v > 0 ? 1.35 : 1;
      const kb = kleurVanCluster(ne.c);
      basisKleurBron.set([kb.r * helder, kb.g * helder, kb.b * helder], i * 3);
      const ko = kleurVanCluster(ne.o ?? ne.c);
      basisKleurBetekenis.set([ko.r * helder, ko.g * helder, ko.b * helder], i * 3);
      basisGrootte[i] = grootteVan(ne.v);
      fase[i] = rf();
    });
    neuronGeo.dispose();
    neuronGeo = new THREE.BufferGeometry();
    neuronGeo.setAttribute("position", new THREE.BufferAttribute((indeling === "betekenis" ? posBetekenis : posBron).slice(), 3));
    neuronGeo.setAttribute("kleur", new THREE.BufferAttribute(basisKleur().slice(), 3));
    neuronGeo.setAttribute("grootte", new THREE.BufferAttribute(basisGrootte.slice(), 1));
    neuronGeo.setAttribute("fase", new THREE.BufferAttribute(fase, 1));
    scene.remove(neuronPunten);
    neuronPunten = new THREE.Points(neuronGeo, neuronMat);
    scene.add(neuronPunten);
    zweef = null;

    ruimLijnenOp();
    const gewoon = maakLijnen(d.lijnen, licht ? 0.12 : 0.2, 0);
    gewoon.obj.visible = opties.lijnen;
    const syn = maakLijnen(
      d.synapsen.map(([a, b]) => [a, b] as [number, number]),
      licht ? 0.28 : 0.42,
      0.35,
    );
    syn.obj.visible = opties.synapsen;
    lijnSets = [gewoon, syn];
    bouwKaarten();
    herkleur();
  };

  const bouwKaarten = () => {
    for (const el of clusterKaarten.values()) el.remove();
    clusterKaarten.clear();
    const lijst = indeling === "betekenis" && data.ontdekt ? data.ontdekt.clusters : data.clusters;
    lijst.forEach((cl, i) => {
      const el = document.createElement("div");
      el.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;background:rgba(8,11,18,0.78);border:1px solid rgba(255,255,255,0.14);border-radius:8px;padding:5px 8px;font-size:11px;line-height:1.3;color:#e8edf5;white-space:nowrap;box-shadow:0 2px 12px rgba(0,0,0,0.5);will-change:transform";
      const kop = document.createElement("div");
      kop.style.cssText = `font-weight:600;color:${themaKleur(i + 1)}`;
      kop.textContent = cl.naam.length > 44 ? `${cl.naam.slice(0, 44)}…` : cl.naam;
      const sub = document.createElement("div");
      sub.style.cssText = "color:rgba(232,237,245,0.72);font-size:10px";
      sub.textContent = `${cl.aantal.toLocaleString("nl-NL")} ${cl.aantal === 1 ? "neuron" : "neuronen"} · ${cl.vuurt === null ? "geen activiteit gemeten" : `vuurt ${cl.vuurt}%`}`;
      el.append(kop, sub);
      labelLaag.appendChild(el);
      clusterKaarten.set(cl.id, el);
    });
  };

  // --- toestand en kleuren
  let focus: Set<string> | null = null;
  let zoek: Set<string> | null = null;
  let oplichten: Set<string> | null = null;
  let hoverId: string | null = null;
  let hoverIndex = -1;
  const herkleur = () => {
    const kAttr = neuronGeo.getAttribute("kleur") as THREE.BufferAttribute | undefined;
    const gAttr = neuronGeo.getAttribute("grootte") as THREE.BufferAttribute | undefined;
    if (!kAttr || !gAttr) return;
    const k = kAttr.array as Float32Array;
    const gr = gAttr.array as Float32Array;
    const bk = basisKleur();
    data.neuronen.forEach((ne, i) => {
      let f = 1;
      if (oplichten?.has(ne.id)) f = 2.1;
      else if (zoek?.has(ne.id)) f = 1.7;
      else if (focus) f = focus.has(ne.id) ? 1.4 : 0.07;
      else if (oplichten) f = 0.25;
      if (ne.id === hoverId) f = Math.max(f, 1.9);
      k[i * 3] = Math.min(1.8, (bk[i * 3] ?? 0) * f);
      k[i * 3 + 1] = Math.min(1.8, (bk[i * 3 + 1] ?? 0) * f);
      k[i * 3 + 2] = Math.min(1.8, (bk[i * 3 + 2] ?? 0) * f);
      gr[i] = (basisGrootte[i] ?? 2.5) * (oplichten?.has(ne.id) ? 1.9 : zoek?.has(ne.id) || ne.id === hoverId ? 1.6 : focus && focus.has(ne.id) ? 1.25 : 1);
    });
    kAttr.needsUpdate = true;
    gAttr.needsUpdate = true;
    for (const s of lijnSets) (s.obj.material as THREE.LineBasicMaterial).opacity = focus || oplichten ? s.opacity * 0.3 : s.opacity;
  };

  /** na een wissel van indeling: lijnen op de nieuwe plekken */
  const lijnenHerpositioneer = () => {
    for (const s of lijnSets) {
      const attr = s.obj.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const kl = s.obj.geometry.getAttribute("color") as THREE.BufferAttribute;
      const karr = kl.array as Float32Array;
      const wit = new THREE.Color(0xffffff);
      const mix = s === lijnSets[1] ? 0.35 : 0;
      s.paren.forEach(([a, b], k) => {
        arr.set([...positieVan(a), ...positieVan(b)], k * 6);
        const ka = kleurVanCluster(clusterVan(a)).lerp(wit, mix);
        const kb = kleurVanCluster(clusterVan(b)).lerp(wit, mix);
        karr.set([ka.r, ka.g, ka.b, kb.r, kb.g, kb.b], k * 6);
      });
      attr.needsUpdate = true;
      kl.needsUpdate = true;
    }
  };

  bouw(eerste);

  // --- gloed
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(breed(), hoog()), licht ? 0.45 : 0.85, 0.5, 0.1);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let metBloom = opties.bloom && !licht;

  // --- aanwijzen en klikken (raycast op de punten)
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: 1.4 };
  const muis = new THREE.Vector2();
  let downAt: { x: number; y: number } | null = null;
  const pik = (clientX: number, clientY: number): number => {
    const rect = renderer.domElement.getBoundingClientRect();
    muis.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(muis, camera);
    const hits = raycaster.intersectObject(neuronPunten, false);
    const keus = hits.find((h) => !focus || focus.has(data.neuronen[h.index ?? -1]?.id ?? "")) ?? hits[0];
    return keus?.index ?? -1;
  };
  const onMove = (e: PointerEvent) => {
    const i = pik(e.clientX, e.clientY);
    if (i !== hoverIndex) {
      hoverIndex = i;
      hoverId = i >= 0 ? data.neuronen[i]?.id ?? null : null;
      renderer.domElement.style.cursor = hoverId ? "pointer" : "grab";
      herkleur();
      opties.onHover(hoverId);
    }
  };
  const onDown = (e: PointerEvent) => {
    downAt = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: PointerEvent) => {
    if (!downAt) return;
    const bewogen = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6;
    downAt = null;
    if (bewogen) return;
    const i = pik(e.clientX, e.clientY);
    const ne = i >= 0 ? data.neuronen[i] : undefined;
    if (ne) opties.onKlik(ne.id);
  };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  // --- vluchten en de vliegtocht langs de clusters
  let vlucht: { van: THREE.Vector3; naar: THREE.Vector3; doelVan: THREE.Vector3; doelNaar: THREE.Vector3; start: number; duur: number } | null = null;
  const vliegHeen = (positie: THREE.Vector3, doel: THREE.Vector3, duur = 1600) => {
    vlucht = { van: camera.position.clone(), naar: positie, doelVan: controls.target.clone(), doelNaar: doel, start: performance.now(), duur: opties.minderBeweging ? 1 : duur };
  };
  const vliegNaarPunt = (p: THREE.Vector3, afstand: number, duur = 1400) => {
    const richting = camera.position.clone().sub(p).normalize();
    if (richting.lengthSq() < 0.01) richting.set(0, 0.4, 1).normalize();
    vliegHeen(p.clone().add(richting.multiplyScalar(afstand)), p.clone(), duur);
  };
  const clusterLijst = () => (indeling === "betekenis" && data.ontdekt ? data.ontdekt.clusters : data.clusters);
  const clusterZicht = (i: number) => {
    const cl = clusterLijst()[i];
    if (!cl) return null;
    const midden = new THREE.Vector3(...cl.centrum);
    const ver = 16 + 2.2 * Math.sqrt(cl.aantal);
    const richting = midden.clone().normalize();
    if (richting.lengthSq() < 0.01) richting.set(0, 0.3, 1).normalize();
    return { positie: midden.clone().add(richting.multiplyScalar(ver)).add(new THREE.Vector3(0, ver * 0.3, 0)), midden };
  };
  let tocht = false;
  let tochtStap = 0;
  let tochtWacht = 0;
  const tochtVolgende = () => {
    const lijst = clusterLijst();
    if (lijst.length === 0) return;
    const z = clusterZicht(tochtStap % lijst.length);
    tochtStap += 1;
    if (!z) return;
    vliegHeen(z.positie, z.midden, 3000);
    tochtWacht = performance.now() + 3000 + 2800;
  };
  const stopTochtDoorGebruiker = () => {
    if (tocht) {
      tocht = false;
      opties.onVliegtochtStop();
    }
  };
  controls.addEventListener("start", stopTochtDoorGebruiker);

  // --- labels
  const projectie = new THREE.Vector3();
  const labelEl = (key: string, tekst: string, kleur: string) => {
    let el = neuronLabels.get(key);
    if (!el) {
      el = document.createElement("div");
      el.style.cssText = "position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none;font-size:11px;text-shadow:0 0 6px #000,0 0 2px #000;will-change:transform;opacity:0.9";
      labelLaag.appendChild(el);
      neuronLabels.set(key, el);
    }
    if (el.textContent !== tekst) el.textContent = tekst;
    el.style.color = kleur;
    return el;
  };
  const schermPositie = (p: readonly number[]) => {
    projectie.set(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0).project(camera);
    return { z: projectie.z, x: (projectie.x * 0.5 + 0.5) * breed(), y: (-projectie.y * 0.5 + 0.5) * hoog() };
  };
  const huidigePositie = (i: number): [number, number, number] => {
    const attr = neuronGeo.getAttribute("position") as THREE.BufferAttribute | undefined;
    const arr = attr?.array as Float32Array | undefined;
    return arr ? [arr[i * 3] ?? 0, arr[i * 3 + 1] ?? 0, arr[i * 3 + 2] ?? 0] : positieVan(i);
  };
  const labelsBijwerken = () => {
    const w = breed();
    const h = hoog();
    const lijst = clusterLijst();
    lijst.forEach((cl, i) => {
      const el = clusterKaarten.get(cl.id);
      if (!el) return;
      const s = schermPositie(cl.centrum);
      const zichtbaar = s.z < 1 && s.x > -200 && s.x < w + 50 && s.y > -60 && s.y < h + 20 && !zweef;
      el.style.display = zichtbaar ? "block" : "none";
      if (zichtbaar) el.style.transform = `translate(${Math.round(s.x + 10)}px, ${Math.round(s.y - 28)}px)`;
      void i;
    });
    const wil = new Map<string, number>();
    const afstandTotDoel = camera.position.distanceTo(controls.target);
    if (afstandTotDoel < 34 && !zweef) {
      const dichtbij = data.neuronen
        .map((ne, i) => ({ i, d: controls.target.distanceToSquared(new THREE.Vector3(...huidigePositie(i))) }))
        .filter((x) => x.d < 400)
        .sort((a, b) => a.d - b.d)
        .slice(0, MAX_NEURON_LABELS);
      for (const x of dichtbij) wil.set(data.neuronen[x.i]!.id, 1);
    }
    if (zoek) for (const id of [...zoek].slice(0, 20)) wil.set(id, 2);
    if (focus) for (const id of [...focus].slice(0, 16)) wil.set(id, 2);
    if (oplichten) for (const id of [...oplichten].slice(0, 12)) wil.set(id, 3);
    if (hoverId) wil.set(hoverId, 4);
    const gezien = new Set<string>();
    const kandidaten = [...wil]
      .map(([id, prio]) => {
        const i = idx.get(id);
        const ne = i !== undefined ? data.neuronen[i] : undefined;
        return ne && i !== undefined ? { id, prio, ne, i, s: schermPositie(huidigePositie(i)) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null && x.s.z < 1 && x.s.x > -60 && x.s.x < w + 60 && x.s.y > -20 && x.s.y < h + 20)
      .sort((a, b) => b.prio - a.prio || a.s.z - b.s.z)
      .slice(0, MAX_NEURON_LABELS + 8);
    for (const x of kandidaten) {
      const el = labelEl(x.id, x.ne.t, themaKleur(clusterVan(x.i) + 1));
      el.style.transform = `translate(${Math.round(x.s.x + 7)}px, ${Math.round(x.s.y - 7)}px)`;
      gezien.add(x.id);
    }
    for (const [key, el] of neuronLabels) {
      if (!gezien.has(key)) {
        el.remove();
        neuronLabels.delete(key);
      }
    }
  };

  // --- nieuw gevoede neuronen: groeien in, met heldere stralen naar hun verwanten
  const toonNieuw = (nieuw: { ids: string[]; buren: string[] }, nu: number) => {
    if (stralenObj) {
      scene.remove(stralenObj);
      stralenObj.geometry.dispose();
      (stralenObj.material as THREE.Material).dispose();
      stralenObj = null;
    }
    const paren: number[] = [];
    for (const id of nieuw.ids) {
      const i = idx.get(id);
      if (i === undefined) continue;
      if (!opties.minderBeweging) groei.set(i, nu);
      const van = positieVan(i);
      for (const b of nieuw.buren) {
        const j = idx.get(b);
        if (j === undefined) continue;
        paren.push(...van, ...positieVan(j));
      }
    }
    if (paren.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(paren), 3));
      stralenObj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
      scene.add(stralenObj);
    }
    const eerste2 = nieuw.ids.map((id) => idx.get(id)).find((i): i is number => i !== undefined);
    if (eerste2 !== undefined) vliegNaarPunt(new THREE.Vector3(...positieVan(eerste2)), 22, 1800);
  };

  // --- tekenen
  let zichtbaar = true;
  let raf: number | null = null;
  const io = new IntersectionObserver((entries) => {
    zichtbaar = entries.some((x) => x.isIntersecting);
  });
  io.observe(host);
  const onVis = () => {
    if (!document.hidden && raf === null) raf = requestAnimationFrame(frame);
  };
  document.addEventListener("visibilitychange", onVis);
  let teller = 0;
  const frame = (nu: number) => {
    raf = null;
    if (document.hidden) return;
    if (zichtbaar) {
      if (vlucht) {
        const t = Math.min(1, (nu - vlucht.start) / vlucht.duur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        camera.position.lerpVectors(vlucht.van, vlucht.naar, e);
        controls.target.lerpVectors(vlucht.doelVan, vlucht.doelNaar, e);
        if (t >= 1) vlucht = null;
      } else if (tocht && nu > tochtWacht) {
        tochtVolgende();
      }
      // zweven naar de andere indeling
      if (zweef) {
        const t = Math.min(1, (nu - zweef.start) / ZWEEF_MS);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const attr = neuronGeo.getAttribute("position") as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        for (let i = 0; i < arr.length; i++) arr[i] = (zweef.van[i] ?? 0) + ((zweef.naar[i] ?? 0) - (zweef.van[i] ?? 0)) * e;
        attr.needsUpdate = true;
        if (t >= 1) {
          zweef = null;
          lijnenHerpositioneer();
          for (const s of lijnSets) s.obj.visible = s === lijnSets[0] ? opties.lijnen : opties.synapsen;
          bouwKaarten();
        }
      }
      // in-groeiende neuronen
      if (groei.size > 0) {
        const gAttr = neuronGeo.getAttribute("grootte") as THREE.BufferAttribute;
        const arr = gAttr.array as Float32Array;
        for (const [i, start] of groei) {
          const t = Math.min(1, (nu - start) / 1400);
          arr[i] = (basisGrootte[i] ?? 2.5) * (0.2 + 2.4 * Math.sin(t * Math.PI) + t);
          if (t >= 1) {
            arr[i] = (basisGrootte[i] ?? 2.5) * 1.3;
            groei.delete(i);
          }
        }
        gAttr.needsUpdate = true;
      }
      // oplichtende neuronen pulseren
      if (oplichten && oplichten.size > 0 && !opties.minderBeweging) {
        const gAttr = neuronGeo.getAttribute("grootte") as THREE.BufferAttribute;
        const arr = gAttr.array as Float32Array;
        const puls = 1.6 + 0.5 * Math.sin(nu / 180);
        for (const id of oplichten) {
          const i = idx.get(id);
          if (i !== undefined) arr[i] = (basisGrootte[i] ?? 2.5) * puls;
        }
        gAttr.needsUpdate = true;
      }
      if (!opties.minderBeweging) {
        neuronMat.uniforms.tijd!.value = nu / 1000;
        hemelPunten.rotation.y += 0.00006;
      }
      controls.update();
      if (metBloom) composer.render();
      else renderer.render(scene, camera);
      teller += 1;
      if (teller % (licht ? 3 : 2) === 0) labelsBijwerken();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  const ro = new ResizeObserver(() => {
    const w = breed();
    const h = hoog();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w, h);
  });
  ro.observe(host);

  return {
    dispose: () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.removeEventListener("start", stopTochtDoorGebruiker);
      controls.dispose();
      scene.traverse((o) => {
        const m = o as { geometry?: { dispose: () => void }; material?: { dispose: () => void } | { dispose: () => void }[] };
        m.geometry?.dispose();
        if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
        else m.material?.dispose();
      });
      textuur.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelLaag.remove();
      neuronLabels.clear();
      clusterKaarten.clear();
    },
    setBloom: (aan) => {
      metBloom = aan && !licht;
    },
    setLijnen: (aan) => {
      opties.lijnen = aan;
      if (lijnSets[0]) lijnSets[0].obj.visible = aan;
    },
    setSynapsen: (aan) => {
      opties.synapsen = aan;
      if (lijnSets[1]) lijnSets[1].obj.visible = aan;
    },
    setIndeling: (nieuw) => {
      if (nieuw === indeling || (nieuw === "betekenis" && !data.ontdekt)) return;
      const attr = neuronGeo.getAttribute("position") as THREE.BufferAttribute;
      const van = (attr.array as Float32Array).slice();
      indeling = nieuw;
      const naar = (indeling === "betekenis" ? posBetekenis : posBron).slice();
      for (const s of lijnSets) s.obj.visible = false;
      for (const el of clusterKaarten.values()) el.style.display = "none";
      if (opties.minderBeweging) {
        (attr.array as Float32Array).set(naar);
        attr.needsUpdate = true;
        lijnenHerpositioneer();
        for (const s of lijnSets) s.obj.visible = s === lijnSets[0] ? opties.lijnen : opties.synapsen;
        bouwKaarten();
      } else zweef = { van, naar, start: performance.now() };
      herkleur();
    },
    setFocus: (ids) => {
      focus = ids;
      herkleur();
    },
    setZoek: (ids) => {
      zoek = ids;
      herkleur();
    },
    setOplichten: (ids) => {
      oplichten = ids && ids.length > 0 ? new Set(ids) : null;
      herkleur();
      const eerste2 = ids?.map((id) => idx.get(id)).find((i): i is number => i !== undefined);
      if (eerste2 !== undefined) {
        stopTochtDoorGebruiker();
        // het midden van de gebruikte neuronen in beeld
        const punten = (ids ?? []).map((id) => idx.get(id)).filter((i): i is number => i !== undefined).map((i) => new THREE.Vector3(...huidigePositie(i)));
        const midden = punten.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, punten.length));
        const spreiding = Math.max(...punten.map((p) => p.distanceTo(midden)), 8);
        vliegNaarPunt(midden, spreiding * 2.2 + 14, 1800);
      }
    },
    vliegNaar: (id) => {
      const i = idx.get(id);
      if (i === undefined) return;
      stopTochtDoorGebruiker();
      vliegNaarPunt(new THREE.Vector3(...huidigePositie(i)), 18);
    },
    vliegNaarCluster: (index) => {
      const z = clusterZicht(index);
      if (!z) return;
      stopTochtDoorGebruiker();
      vliegHeen(z.positie, z.midden, 1800);
    },
    vliegtocht: (aan) => {
      tocht = aan;
      if (aan) {
        tochtWacht = 0;
        controls.autoRotate = false;
      } else controls.autoRotate = !opties.minderBeweging;
    },
    reset: () => {
      tocht = false;
      focus = null;
      oplichten = null;
      herkleur();
      vliegHeen(startPos(), new THREE.Vector3(0, 0, 0), 1200);
    },
    zetData: (d, nieuw) => {
      groei = new Map();
      bouw(d);
      if (nieuw) toonNieuw(nieuw, performance.now());
    },
    foto: () => {
      try {
        if (metBloom) composer.render();
        else renderer.render(scene, camera);
        return renderer.domElement.toDataURL("image/png");
      } catch {
        return null;
      }
    },
  };
}
