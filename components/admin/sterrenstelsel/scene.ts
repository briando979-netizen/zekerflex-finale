import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { GraafKnoop, GraafLijn } from "@/lib/rag/graph-analyse";
import type { Layout3D, Punt3 } from "@/lib/rag/graph-layout3d";
import { themaKleur } from "@/components/admin/sterrenstelsel/kleuren";

// De Kennisgraaf als sterrenstelsel: elke knoop een ster (één InstancedMesh, dus ook
// duizenden sterren in één tekenopdracht), grootte = aantal verbindingen, kleur = thema.
// Elk thema is een zonnestelsel met een zon in het midden en banen eromheen; de posities
// komen vooraf berekend van de server (lib/rag/graph-layout3d.ts). Verbindingen zijn zachte
// lijnen (standaard alleen de sterkste), de bruggen (tussenligging) heldere stralen die
// thema's verbinden. Sterrenhemel, gloed (bloom, uit te zetten), labels alleen voor de
// grootste sterren en de zonnen, en bij aanwijzen of focus. Besturing: draaien, zoomen,
// klikken (focus), vliegtocht langs de thema's, naar een ster vliegen. Lichte stand voor
// zwakke apparaten en "minder beweging". Alleen echte gegevens uit de graaf. Dit bestand
// laadt three.js en wordt alleen op de pagina Kennisgraaf gehaald, pas als iemand het
// Sterrenstelsel kiest (components/admin/Sterrenstelsel.tsx).

export interface SterData {
  nodes: GraafKnoop[];
  edges: GraafLijn[];
  themas: { id: number; naam: string }[];
  bruggen: string[];
  layout: Layout3D;
}

export interface SterOpties {
  licht: boolean;
  bloom: boolean;
  alleLijnen: boolean;
  minderBeweging: boolean;
  onHover: (id: string | null) => void;
  onKlik: (id: string) => void;
  onVliegtochtStop: () => void;
}

export interface SterHandle {
  dispose: () => void;
  setBloom: (aan: boolean) => void;
  setAlleLijnen: (aan: boolean) => void;
  /** alleen deze knopen helder; null = alles */
  setFocus: (ids: Set<string> | null) => void;
  /** het kortste pad: deze knopen en de lijnen ertussen licht op; null = weg */
  setPad: (ids: string[] | null) => void;
  /** treffers van het zoekveld: labels erbij en een ring eromheen */
  setZoek: (ids: Set<string> | null) => void;
  vliegNaar: (id: string) => void;
  vliegtocht: (aan: boolean) => void;
  reset: () => void;
  /** een foto van het beeld (PNG als data-URL), of null */
  foto: () => string | null;
}

const ACHTERGROND = 0x05070c;
const MAX_LABELS = 28;

interface Ster {
  id: string;
  label: string;
  thema: number | undefined;
  begrip: boolean;
  graad: number;
  straal: number;
  pos: THREE.Vector3;
  kleur: THREE.Color;
}

function sleutel(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Een deterministische toevalsgenerator voor de sterrenhemel (zelfde hemel bij elke opening). */
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

export function createSterrenstelsel(host: HTMLDivElement, data: SterData, opties: SterOpties): SterHandle {
  const { licht } = opties;
  const breed = () => Math.max(1, host.clientWidth);
  const hoog = () => Math.max(1, host.clientHeight);

  // --- de sterren (knopen) uit de echte graaf
  const graad = new Map<string, number>();
  for (const e of data.edges) {
    graad.set(e.source, (graad.get(e.source) ?? 0) + 1);
    graad.set(e.target, (graad.get(e.target) ?? 0) + 1);
  }
  const sterren: Ster[] = data.nodes.map((n) => {
    const p: Punt3 = data.layout.posities[n.id] ?? [0, 0, 0];
    const g = graad.get(n.id) ?? 0;
    const begrip = n.group === "begrip";
    return {
      id: n.id,
      label: n.label,
      thema: n.thema,
      begrip,
      graad: g,
      straal: begrip ? 0.55 + 0.12 * Math.sqrt(g) : 0.9 + 0.38 * Math.sqrt(g),
      pos: new THREE.Vector3(p[0], p[1], p[2]),
      kleur: new THREE.Color(themaKleur(n.thema)).multiplyScalar(begrip ? 0.75 : 1),
    };
  });
  const sterIdx = new Map<string, number>(sterren.map((s, i) => [s.id, i]));
  const themaNaam = new Map(data.themas.map((t) => [t.id, t.naam]));
  const brugSet = new Set(data.bruggen);

  // --- renderer, scène, camera
  const renderer = new THREE.WebGLRenderer({ antialias: !licht, alpha: false, powerPreference: licht ? "low-power" : "high-performance", preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, licht ? 1 : 2));
  renderer.setSize(breed(), hoog());
  renderer.setClearColor(ACHTERGROND, 1);
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.style.display = "block";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const straal = Math.max(40, data.layout.straal);
  const camera = new THREE.PerspectiveCamera(50, breed() / hoog(), 0.5, straal * 40);
  const startPos = new THREE.Vector3(0, straal * 0.9, straal * 2.4);
  camera.position.copy(startPos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = straal * 6;
  controls.autoRotate = !opties.minderBeweging && !licht;
  controls.autoRotateSpeed = 0.35;

  // --- sterrenhemel
  const hemelAantal = licht ? 900 : 3200;
  const hemel = new Float32Array(hemelAantal * 3);
  const r = toeval(20261113);
  for (let i = 0; i < hemelAantal; i++) {
    const u = r() * 2 - 1;
    const phi = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const d = straal * (6 + r() * 4);
    hemel[i * 3] = s * Math.cos(phi) * d;
    hemel[i * 3 + 1] = u * d;
    hemel[i * 3 + 2] = s * Math.sin(phi) * d;
  }
  const hemelGeo = new THREE.BufferGeometry();
  hemelGeo.setAttribute("position", new THREE.BufferAttribute(hemel, 3));
  const hemelMat = new THREE.PointsMaterial({ color: 0xb7c2d6, size: licht ? 1.2 : 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75, depthWrite: false });
  const hemelPunten = new THREE.Points(hemelGeo, hemelMat);
  scene.add(hemelPunten);

  // --- zonnen en banen per thema
  const zonnen = new THREE.Group();
  const zonPositie = new Map<number, THREE.Vector3>();
  for (const t of data.themas) {
    const c = data.layout.centra[t.id];
    if (!c) continue;
    const midden = new THREE.Vector3(c[0], c[1], c[2]);
    zonPositie.set(t.id, midden);
    const kleur = new THREE.Color(themaKleur(t.id));
    const leden = sterren.filter((s) => s.thema === t.id && !s.begrip);
    const zonStraal = 1.6 + 0.5 * Math.sqrt(leden.length);
    const zon = new THREE.Mesh(new THREE.SphereGeometry(zonStraal, licht ? 12 : 24, licht ? 8 : 16), new THREE.MeshBasicMaterial({ color: kleur.clone().multiplyScalar(1.15), toneMapped: false }));
    zon.position.copy(midden);
    zon.userData = { thema: t.id };
    zonnen.add(zon);
    // een zachte corona
    const corona = new THREE.Mesh(new THREE.SphereGeometry(zonStraal * 1.9, licht ? 10 : 20, licht ? 8 : 14), new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    corona.position.copy(midden);
    zonnen.add(corona);
    // banen op de afstanden waar de leden echt liggen (kwartielen), elk in een eigen vlak
    const afstanden = leden.map((s) => s.pos.distanceTo(midden)).sort((a, b) => a - b);
    const kwartiel = (q: number) => afstanden[Math.min(afstanden.length - 1, Math.floor(q * afstanden.length))] ?? 0;
    const rb = toeval(t.id * 7919);
    for (const q of afstanden.length >= 3 ? [0.35, 0.7, 0.95] : afstanden.length > 0 ? [0.9] : []) {
      const rad = Math.max(zonStraal * 1.6, kwartiel(q));
      const punten: THREE.Vector3[] = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        punten.push(new THREE.Vector3(Math.cos(a) * rad, 0, Math.sin(a) * rad));
      }
      const baan = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(punten), new THREE.LineBasicMaterial({ color: kleur, transparent: true, opacity: 0.16, depthWrite: false }));
      baan.position.copy(midden);
      baan.rotation.set((rb() - 0.5) * 1.2, rb() * Math.PI, (rb() - 0.5) * 1.2);
      zonnen.add(baan);
    }
  }
  scene.add(zonnen);

  // --- de sterren als één InstancedMesh
  const sterGeo = new THREE.SphereGeometry(1, licht ? 8 : 14, licht ? 6 : 10);
  const sterMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const sterMesh = new THREE.InstancedMesh(sterGeo, sterMat, Math.max(1, sterren.length));
  const m4 = new THREE.Matrix4();
  const dof = new THREE.Color();
  const zetSterKleuren = (helder: (s: Ster) => number) => {
    sterren.forEach((s, i) => {
      dof.copy(s.kleur).multiplyScalar(helder(s));
      sterMesh.setColorAt(i, dof);
    });
    if (sterMesh.instanceColor) sterMesh.instanceColor.needsUpdate = true;
  };
  sterren.forEach((s, i) => {
    m4.makeScale(s.straal, s.straal, s.straal).setPosition(s.pos);
    sterMesh.setMatrixAt(i, m4);
  });
  sterMesh.instanceMatrix.needsUpdate = true;
  zetSterKleuren(() => 1);
  sterMesh.count = sterren.length;
  scene.add(sterMesh);

  // --- lijnen: de sterkste standaard, de rest erbij op verzoek; bruggen als heldere stralen
  const gewichten = data.edges.filter((e) => e.soort !== "begrip").map((e) => e.weight).sort((a, b) => a - b);
  const drempel = gewichten[Math.floor(gewichten.length * 0.5)] ?? 0;
  const isBrugStraal = (e: GraafLijn) => {
    const a = sterren[sterIdx.get(e.source) ?? -1];
    const b = sterren[sterIdx.get(e.target) ?? -1];
    return Boolean(a && b && (brugSet.has(e.source) || brugSet.has(e.target)) && a.thema !== b.thema && e.soort !== "begrip");
  };
  interface LijnSet {
    lijnen: GraafLijn[];
    obj: THREE.LineSegments;
    basis: Float32Array;
  }
  const maakLijnen = (lijnen: GraafLijn[], opacity: number, mix: number): LijnSet => {
    const pos = new Float32Array(lijnen.length * 6);
    const kleuren = new Float32Array(lijnen.length * 6);
    const wit = new THREE.Color(0xffffff);
    lijnen.forEach((e, k) => {
      const a = sterren[sterIdx.get(e.source) ?? -1];
      const b = sterren[sterIdx.get(e.target) ?? -1];
      if (!a || !b) return;
      pos.set([a.pos.x, a.pos.y, a.pos.z, b.pos.x, b.pos.y, b.pos.z], k * 6);
      const ka = a.kleur.clone().lerp(wit, mix);
      const kb = b.kleur.clone().lerp(wit, mix);
      kleuren.set([ka.r, ka.g, ka.b, kb.r, kb.g, kb.b], k * 6);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(kleuren, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const obj = new THREE.LineSegments(geo, mat);
    scene.add(obj);
    return { lijnen, obj, basis: kleuren.slice() };
  };
  const stralen = maakLijnen(data.edges.filter(isBrugStraal), 0.85, 0.55);
  const sterk = maakLijnen(data.edges.filter((e) => !isBrugStraal(e) && e.soort !== "begrip" && e.weight >= drempel), 0.3, 0.15);
  const rest = maakLijnen(data.edges.filter((e) => !isBrugStraal(e) && (e.soort === "begrip" || e.weight < drempel)), 0.14, 0);
  rest.obj.visible = opties.alleLijnen;
  const lijnSets = [stralen, sterk, rest];

  // --- gloed
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(breed(), hoog()), licht ? 0.6 : 0.95, 0.45, 0.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let metBloom = opties.bloom && !licht;

  // --- labels: gewone HTML boven het canvas, door dit bestand beheerd (geen React per frame)
  const labelLaag = document.createElement("div");
  labelLaag.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:inherit";
  host.appendChild(labelLaag);
  const labelEls = new Map<string, HTMLDivElement>();
  const labelEl = (key: string, tekst: string, kleur: string, groot: boolean) => {
    let el = labelEls.get(key);
    if (!el) {
      el = document.createElement("div");
      el.style.cssText = "position:absolute;left:0;top:0;white-space:nowrap;pointer-events:none;text-shadow:0 0 6px #000,0 0 2px #000;will-change:transform";
      labelLaag.appendChild(el);
      labelEls.set(key, el);
    }
    if (el.textContent !== tekst) el.textContent = tekst;
    el.style.color = kleur;
    el.style.fontSize = groot ? "13px" : "11px";
    el.style.fontWeight = groot ? "600" : "400";
    el.style.opacity = groot ? "0.95" : "0.8";
    return el;
  };
  const grootsteSterren = [...sterren].filter((s) => !s.begrip).sort((a, b) => b.graad - a.graad).slice(0, MAX_LABELS).map((s) => s.id);

  // --- toestand
  let focus: Set<string> | null = null;
  let pad: string[] | null = null;
  let zoek: Set<string> | null = null;
  let hoverId: string | null = null;
  let hoverIndex = -1;
  const padLijnen = new Set<string>();

  const herkleur = () => {
    const padSet = new Set(pad ?? []);
    zetSterKleuren((s) => {
      if (padSet.has(s.id)) return 1.6;
      if (zoek?.has(s.id)) return 1.5;
      if (focus) return focus.has(s.id) ? 1.15 : 0.08;
      return 1;
    });
    for (const set of lijnSets) {
      const attr = set.obj.geometry.getAttribute("color") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      set.lijnen.forEach((e, k) => {
        const opPad = padLijnen.has(sleutel(e.source, e.target));
        const inFocus = !focus || (focus.has(e.source) && focus.has(e.target));
        const f = opPad ? 2.2 : inFocus ? 1 : 0.06;
        for (let c = 0; c < 6; c++) arr[k * 6 + c] = Math.min(1, (set.basis[k * 6 + c] ?? 0) * f + (opPad ? 0.35 : 0));
      });
      attr.needsUpdate = true;
    }
  };

  // --- aanwijzen en klikken (raycast op de InstancedMesh)
  const raycaster = new THREE.Raycaster();
  const muis = new THREE.Vector2();
  let downAt: { x: number; y: number } | null = null;
  const pik = (clientX: number, clientY: number): number => {
    const rect = renderer.domElement.getBoundingClientRect();
    muis.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(muis, camera);
    const hit = raycaster.intersectObject(sterMesh, false)[0];
    return hit?.instanceId ?? -1;
  };
  const onMove = (e: PointerEvent) => {
    const i = pik(e.clientX, e.clientY);
    if (i !== hoverIndex) {
      hoverIndex = i;
      hoverId = i >= 0 ? sterren[i]?.id ?? null : null;
      renderer.domElement.style.cursor = hoverId ? "pointer" : "grab";
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
    const s = i >= 0 ? sterren[i] : undefined;
    if (s) opties.onKlik(s.id);
  };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);

  // --- camera-vluchten (tween) en de vliegtocht
  let vlucht: { van: THREE.Vector3; naar: THREE.Vector3; doelVan: THREE.Vector3; doelNaar: THREE.Vector3; start: number; duur: number } | null = null;
  const vliegHeen = (positie: THREE.Vector3, doel: THREE.Vector3, duur = 1600) => {
    vlucht = { van: camera.position.clone(), naar: positie, doelVan: controls.target.clone(), doelNaar: doel, start: performance.now(), duur: opties.minderBeweging ? 1 : duur };
  };
  let tocht = false;
  let tochtStap = 0;
  let tochtWacht = 0;
  const tochtVolgende = () => {
    const themaLijst = data.themas.filter((t) => zonPositie.has(t.id));
    if (themaLijst.length === 0) return;
    const t = themaLijst[tochtStap % themaLijst.length]!;
    tochtStap += 1;
    const zon = zonPositie.get(t.id)!;
    const leden = sterren.filter((s) => s.thema === t.id);
    const ver = 14 + 3 * Math.sqrt(leden.length);
    const richting = zon.clone().normalize();
    if (richting.lengthSq() < 0.01) richting.set(0, 0.3, 1).normalize();
    const positie = zon.clone().add(richting.multiplyScalar(ver)).add(new THREE.Vector3(0, ver * 0.35, 0));
    vliegHeen(positie, zon, 3200);
    tochtWacht = performance.now() + 3200 + 2600;
  };
  const stopTochtDoorGebruiker = () => {
    if (tocht) {
      tocht = false;
      opties.onVliegtochtStop();
    }
  };
  controls.addEventListener("start", stopTochtDoorGebruiker);

  // --- tekenen
  const projectie = new THREE.Vector3();
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

  const labelsBijwerken = () => {
    const w = breed();
    const h = hoog();
    const wil = new Map<string, { tekst: string; kleur: string; groot: boolean; pos: THREE.Vector3; prioriteit: number }>();
    for (const [tid, p] of zonPositie) wil.set(`zon:${tid}`, { tekst: `${tid}. ${themaNaam.get(tid) ?? ""}`, kleur: themaKleur(tid), groot: true, pos: p, prioriteit: 3 });
    const sterLabel = (id: string, prioriteit: number) => {
      const s = sterren[sterIdx.get(id) ?? -1];
      if (s) wil.set(id, { tekst: s.label.length > 40 ? `${s.label.slice(0, 40)}…` : s.label, kleur: `#${s.kleur.getHexString()}`, groot: false, pos: s.pos, prioriteit });
    };
    if (!focus && !zoek) for (const id of grootsteSterren) sterLabel(id, 1);
    if (focus) for (const id of [...focus].slice(0, 60)) sterLabel(id, 2);
    if (zoek) for (const id of [...zoek].slice(0, 30)) sterLabel(id, 2);
    if (pad) for (const id of pad) sterLabel(id, 3);
    if (hoverId) sterLabel(hoverId, 4);
    // alleen wat vóór de camera staat, en de dichtstbijzijnde eerst als er te veel zijn
    const lijst = [...wil]
      .map(([key, l]) => {
        projectie.copy(l.pos).project(camera);
        return { key, l, z: projectie.z, x: (projectie.x * 0.5 + 0.5) * w, y: (-projectie.y * 0.5 + 0.5) * h };
      })
      .filter((x) => x.z < 1 && x.z > -1 && x.x > -40 && x.x < w + 40 && x.y > -20 && x.y < h + 20)
      .sort((a, b) => b.l.prioriteit - a.l.prioriteit || a.z - b.z)
      .slice(0, MAX_LABELS + 12);
    const gezien = new Set<string>();
    for (const x of lijst) {
      const el = labelEl(x.key, x.l.tekst, x.l.kleur, x.l.groot);
      el.style.transform = `translate(${Math.round(x.x + 8)}px, ${Math.round(x.y - 8)}px)`;
      gezien.add(x.key);
    }
    for (const [key, el] of labelEls) {
      if (!gezien.has(key)) {
        el.remove();
        labelEls.delete(key);
      }
    }
  };

  let frameTeller = 0;
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
      controls.update();
      if (!licht && !opties.minderBeweging) hemelPunten.rotation.y += 0.00008;
      if (metBloom) composer.render();
      else renderer.render(scene, camera);
      frameTeller += 1;
      if (frameTeller % (licht ? 3 : 2) === 0) labelsBijwerken();
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

  const handle: SterHandle = {
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
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelLaag.remove();
      labelEls.clear();
    },
    setBloom: (aan) => {
      metBloom = aan && !licht;
    },
    setAlleLijnen: (aan) => {
      rest.obj.visible = aan;
    },
    setFocus: (ids) => {
      focus = ids;
      herkleur();
    },
    setPad: (ids) => {
      pad = ids;
      padLijnen.clear();
      if (ids) for (let i = 1; i < ids.length; i++) padLijnen.add(sleutel(ids[i - 1]!, ids[i]!));
      herkleur();
    },
    setZoek: (ids) => {
      zoek = ids;
      herkleur();
    },
    vliegNaar: (id) => {
      const s = sterren[sterIdx.get(id) ?? -1];
      if (!s) return;
      stopTochtDoorGebruiker();
      const richting = camera.position.clone().sub(s.pos).normalize();
      if (richting.lengthSq() < 0.01) richting.set(0, 0.4, 1).normalize();
      vliegHeen(s.pos.clone().add(richting.multiplyScalar(16 + s.straal * 6)), s.pos.clone(), 1400);
    },
    vliegtocht: (aan) => {
      tocht = aan;
      if (aan) {
        tochtWacht = 0;
        controls.autoRotate = false;
      } else controls.autoRotate = !opties.minderBeweging && !licht;
    },
    reset: () => {
      tocht = false;
      vliegHeen(startPos.clone(), new THREE.Vector3(0, 0, 0), 1200);
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
  return handle;
}
