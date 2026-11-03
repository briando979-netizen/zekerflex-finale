import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { COMPANY_SLOTS, companyFloors, dayPhase, EXITS, houseCount, LANDMARKS, LANE_BIKE, LANE_CAR, laneOffset, millSpeed, type Origin, type Plot, type Pt, type RoadPt, sunAt, trafficFor, tripCenter } from "@/lib/admin/city-layout";
import { courierRoute, roomCenter } from "@/lib/admin/office3d-layout";
import type { CityData } from "@/lib/admin/city-data";
import { count, euro } from "@/lib/admin/format";
import { blobTexture, makeKit, seeded, skyTexture, windowTextures } from "@/components/admin/city/parts";
import { roomOf, type CityEvent } from "@/components/admin/city/rooms";
import { bike, boat, Mover, robot, TRAFFIC_COLORS, vehicle } from "@/components/admin/city/vehicles";
import { type Anchor, buildCompanies, buildDock, buildHouses, buildOffice, buildWorld, type CompanyLayer, type Layer, type Pick, ROAD_TOP, SLAB } from "@/components/admin/city/world";

// De motor van de 3D-stad rond het live kantoor: camera, dag en nacht (echte
// zonnestand boven Amsterdam), alles wat beweegt, en klikken op gebouwen.
// Echte gebeurtenissen rijden als voertuig van hun herkomst naar het
// hoofdkantoor, waar een robot ze naar de afdeling brengt. Fietsers zijn
// mensen die nu een dienst hebben; gewoon verkeer wordt drukker als er meer
// mensen werken. Tekenen pauzeert buiten beeld en in een verborgen tabblad.

export type View = "stad" | "hq" | "bedrijven" | "woonwijk" | "bank" | "datacenter" | "magazijn" | "opleiding" | "park";
export const TOUR: View[] = ["stad", "hq", "bedrijven", "bank", "datacenter", "magazijn", "opleiding", "woonwijk", "park"];

export interface CityHandle {
  setData: (d: CityData) => void;
  pushEvents: (evs: CityEvent[]) => void;
  /** Speel gebeurtenissen (oudste eerst) versneld af; `onStep` krijgt elke vertrekkende gebeurtenis, en null aan het eind. */
  replay: (evs: CityEvent[], onStep: (ev: CityEvent | null, left: number) => void) => void;
  stopReplay: () => void;
  fly: (to: View | { company: string }) => void;
  tour: (on: boolean) => void;
  select: (p: Pick | null) => void;
  dispose: () => void;
}

type Place = { door?: Pt; road: RoadPt };
interface Trip {
  mover: Mover;
  g: THREE.Object3D;
  ev: CityEvent;
  from: Place;
  back: boolean;
  wait: number;
  /** Afgespeeld uit de laatste 24 uur: sneller, en na het afleveren meteen weg. */
  replay: boolean;
}

const SPEED_CAR = 9;
const SPEED_BIKE = 3.6;
const SPEED_WALK = 3.2;
const MAX_TRIPS = 8;

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

/** Rijdt er vlak voor deze auto iemand in dezelfde richting op dezelfde rijstrook? Dan even wachten. */
function tooClose(m: Mover, all: Mover[]): boolean {
  const p = m.obj.position;
  const hx = Math.sin(m.obj.rotation.y);
  const hz = Math.cos(m.obj.rotation.y);
  for (const o of all) {
    if (o === m || o.done) continue;
    const dx = o.obj.position.x - p.x;
    const dz = o.obj.position.z - p.z;
    const ahead = dx * hx + dz * hz;
    if (ahead <= 0.05 || ahead > 3.6) continue;
    if (Math.abs(dx * hz - dz * hx) > 0.9) continue;
    if (Math.sin(o.obj.rotation.y) * hx + Math.cos(o.obj.rotation.y) * hz > 0.5) return true;
  }
  return false;
}
const sevColor = (s: string) => (s === "critical" ? 0xdc2626 : s === "warning" ? 0xf59e0b : 0x334155);

export function createCity(host: HTMLDivElement, labelHost: HTMLDivElement, opts: { reduced: boolean; onPick: (p: Pick | null) => void; onTourEnd: () => void }): CityHandle {
  const { reduced } = opts;
  const rnd = seeded(Date.now() % 100_000);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Schaduwen van stilstaande dingen; alleen opnieuw als de zon of de gebouwen veranderen.
  renderer.shadowMap.autoUpdate = false;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, host.clientWidth / host.clientHeight, 0.5, 900);
  camera.position.set(0, 78, 104);

  const kit = makeKit();
  const win = windowTextures(kit);
  const shadow = blobTexture(kit);
  const sky = skyTexture(kit);
  scene.background = sky.texture;
  scene.fog = new THREE.Fog(0xdcecf7, 280, 640);

  const hemi = new THREE.HemisphereLight(0xffffff, 0xb7c4a8, 1.3);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -100, right: 100, top: 100, bottom: -100, near: 1, far: 400 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  const moon = new THREE.DirectionalLight(0x9fb3ff, 0);
  moon.position.set(-60, 120, -40);
  scene.add(hemi, sun, moon);

  const stars = (() => {
    const pts: number[] = [];
    const r = seeded(11);
    for (let i = 0; i < 500; i++) {
      const a = r() * Math.PI * 2;
      const e = 0.12 + r() * 1.3;
      pts.push(Math.cos(a) * Math.cos(e) * 600, Math.sin(e) * 600, Math.sin(a) * Math.cos(e) * 600);
    }
    const g = kit.track(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const m = kit.track(new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false }));
    return new THREE.Points(g, m);
  })();
  scene.add(stars);

  // --- de stad ------------------------------------------------------------
  const world = buildWorld(kit, win);
  const office = buildOffice(kit, shadow);
  scene.add(world.layer.group, office.layer.group);
  let companies: CompanyLayer = buildCompanies(kit, [], win);
  let houses: { layer: Layer; built: Plot[] } = buildHouses(kit, 0);
  let dock: Layer = buildDock(kit, 0, 0, shadow);
  scene.add(companies.layer.group, houses.layer.group, dock.group);
  let data: CityData | null = null;
  let companyIds = new Set<string>();
  let sigCompanies = "";
  let orderCompanies = "";
  let sigHouses = -1;
  let sigDock = "";

  const layers = () => [world.layer, office.layer, companies.layer, houses.layer, dock];
  // voertuigen met een echte gebeurtenis; aanklikbaar, dan toont het paneel die gebeurtenis
  const trips: Trip[] = [];
  let pickables: THREE.Object3D[] = [];
  const refreshPickables = () => (pickables = [...layers().flatMap((l) => l.pickables), ...trips.map((t) => t.g)]);
  refreshPickables();

  // --- naamkaartjes -------------------------------------------------------
  const labels = new Map<string, { el: HTMLSpanElement; a: Anchor; w: number; h: number; rank: number }>();
  // voorrang als bordjes elkaar overlappen: gebouwen eerst, dan klanten, wijken, afdelingen
  const rankOf = (a: Anchor) => (a.key === "woonwijk" || a.key === "bedrijventerrein" ? 2 : a.tier === "landmark" ? 0 : a.tier === "company" ? 1 : 3);
  let selectedKey = "";
  const labelText = (a: Anchor): string => {
    const d = data;
    if (!d) return a.text;
    switch (a.key) {
      case "landmark:bank":
        return `Bank · ${euro(d.money.openCents)} open`;
      case "landmark:magazijn":
        return `Magazijn · ${count(d.shop.toShip)} te versturen`;
      case "landmark:datacenter":
        return `Datacenter · ${count(d.ai.callsToday)} AI-verzoeken`;
      case "landmark:opleiding":
        return `Opleiding · ${count(d.certificates.total)} certificaten`;
      case "woonwijk":
        return `Woonwijk · ${count(d.workers.total)} werkers, ${count(d.workers.workingNow)} aan het werk`;
      case "bedrijventerrein":
        return `Bedrijventerrein · ${count(d.companiesTotal)} klanten`;
      default:
        return a.text;
    }
  };
  const refreshLabels = () => {
    const anchors = layers().flatMap((l) => l.anchors);
    const keys = new Set(anchors.map((a) => a.key));
    for (const [k, l] of labels) {
      if (!keys.has(k)) {
        l.el.remove();
        labels.delete(k);
      }
    }
    for (const a of anchors) {
      let l = labels.get(a.key);
      if (!l) {
        const el = document.createElement("span");
        el.className = `pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full px-2 py-0.5 font-semibold shadow ${a.tier === "landmark" ? "text-[12px]" : a.tier === "company" ? "text-[10.5px]" : "text-[11px]"}`;
        el.style.background = "rgba(255,255,255,.92)";
        el.style.color = "#0f172a";
        labelHost.appendChild(el);
        l = { el, a, w: 0, h: 0, rank: rankOf(a) };
        labels.set(a.key, l);
      }
      l.a = a;
      const text = labelText(a);
      if (l.el.textContent !== text || !l.w) {
        l.el.textContent = text;
        // maat één keer meten (niet elk beeld), voor het verbergen van overlappende bordjes
        const shown = l.el.style.display;
        l.el.style.display = "";
        l.w = l.el.offsetWidth;
        l.h = l.el.offsetHeight;
        l.el.style.display = shown;
      }
      l.el.style.outline = a.key === selectedKey ? "2px solid #4f6bed" : "";
    }
    order = [...labels.values()].sort((x, y) => x.rank - y.rank);
  };
  let order: { el: HTMLSpanElement; a: Anchor; w: number; h: number; rank: number }[] = [];
  refreshLabels();

  // --- camera -------------------------------------------------------------
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 8;
  controls.maxDistance = 280;
  controls.maxPolarAngle = 1.32;
  controls.target.set(0, 0, 6);
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 0.25;

  let fly: { p0: THREE.Vector3; p1: THREE.Vector3; t0: THREE.Vector3; t1: THREE.Vector3; start: number; dur: number } | null = null;
  let touring = false;
  let tourStep = 0;
  let nextTourAt = 0;
  // gekozen voertuig: de ring rijdt mee; de camera alleen tot je zelf draait of schuift
  let follow: THREE.Object3D | null = null;
  let followCam = false;
  const stopTour = () => {
    if (!touring) return;
    touring = false;
    opts.onTourEnd();
  };
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    fly = null;
    followCam = false;
    stopTour();
  });

  const viewFor = (to: View | { company: string }): { pos: THREE.Vector3; target: THREE.Vector3 } => {
    const around = (x: number, y: number, z: number, dx: number, dy: number, dz: number) => ({ target: new THREE.Vector3(x, y, z), pos: new THREE.Vector3(x + dx, y + dy, z + dz) });
    if (typeof to === "object") {
      const k = data?.companies.findIndex((c) => c.id === to.company) ?? -1;
      const s = COMPANY_SLOTS[k] ?? COMPANY_SLOTS[0];
      return s ? around(s.x, 3, s.z, 12, 18, 24) : around(0, 0, -48, 0, 55, 56);
    }
    switch (to) {
      case "stad":
        return around(0, 0, 8, 0, 140, 155);
      case "hq":
        return around(0, 0, 0, 0, 38, 42);
      case "bedrijven":
        return around(0, 0, -48, 0, 52, 58);
      case "woonwijk":
        return around(0, 0, 50, 0, 46, 54);
      case "park":
        return around(LANDMARKS.park.x, 3, LANDMARKS.park.z - 4, 16, 20, 30);
      default: {
        const p = LANDMARKS[to];
        return around(p.x, 2, p.z, 14, 22, 28);
      }
    }
  };
  const flyToPoints = (pos: THREE.Vector3, target: THREE.Vector3) => {
    controls.autoRotate = false;
    if (reduced) {
      camera.position.copy(pos);
      controls.target.copy(target);
      controls.update();
      return;
    }
    fly = { p0: camera.position.clone(), p1: pos, t0: controls.target.clone(), t1: target, start: performance.now(), dur: 1700 };
  };
  const flyTo = (to: View | { company: string }) => {
    const v = viewFor(to);
    flyToPoints(v.pos, v.target);
  };

  // --- selectie: ring op de grond onder wat gekozen is ---------------------
  const ringMat = kit.track(new THREE.MeshBasicMaterial({ color: 0x4f6bed, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(kit.track(new THREE.RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2)), ringMat);
  ring.visible = false;
  ring.renderOrder = 2;
  scene.add(ring);
  const select = (p: Pick | null) => {
    selectedKey = "";
    follow = null;
    followCam = false;
    ring.visible = Boolean(p);
    if (!p) return refreshLabels();
    if (p.kind === "event") {
      // het voertuig van deze gebeurtenis, als het nog rijdt: erheen vliegen en meekijken
      const t = trips.find((x) => x.ev.id === p.id);
      ring.visible = Boolean(t);
      if (t) {
        follow = t.g;
        followCam = true;
        ring.scale.setScalar(2.6);
        const at = t.g.position;
        flyToPoints(new THREE.Vector3(at.x + 8, 28, at.z + 22), new THREE.Vector3(at.x, 0, at.z));
      }
      return refreshLabels();
    }
    let x = 0;
    let z = 0;
    let r = 8;
    if (p.kind === "room") {
      const room = roomOf(p.id);
      [x, z] = roomCenter(room.cx, room.cy);
      r = 6.6;
      selectedKey = `room:${p.id}`;
    } else if (p.kind === "landmark") {
      const l = LANDMARKS[p.id];
      x = l.x;
      z = l.z;
      r = Math.max(l.w, l.d) * (p.id === "hq" ? 0.72 : 0.62);
      selectedKey = `landmark:${p.id}`;
    } else if (p.kind === "company") {
      const s = COMPANY_SLOTS[data?.companies.findIndex((c) => c.id === p.id) ?? -1];
      if (s) [x, z, r] = [s.x, s.z, 8.5];
      selectedKey = `company:${p.id}`;
    } else if (p.kind === "woonwijk") {
      [x, z, r] = [0, 48, 30];
      selectedKey = "woonwijk";
    } else if (p.kind === "bedrijventerrein") {
      [x, z, r] = [0, -48, 30];
      selectedKey = "bedrijventerrein";
    } else {
      const s = COMPANY_SLOTS[data?.companies.length ?? 0];
      if (s) [x, z, r] = [s.x, s.z, 8.5];
      selectedKey = "kavel";
    }
    ring.position.set(x, SLAB + 0.12, z);
    ring.scale.setScalar(r);
    refreshLabels();
  };

  // --- klikken en aanwijzen ----------------------------------------------
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pickAt = (clientX: number, clientY: number): Pick | null => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    for (const hit of ray.intersectObjects(pickables, true)) {
      let o: THREE.Object3D | null = hit.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o) return o.userData.pick as Pick;
    }
    return null;
  };
  let down: { t: number; x: number; y: number } | null = null;
  const onDown = (ev: PointerEvent) => (down = { t: performance.now(), x: ev.clientX, y: ev.clientY });
  const onUp = (ev: PointerEvent) => {
    if (!down) return;
    const click = performance.now() - down.t < 350 && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 6; // slepen is draaien
    down = null;
    if (!click) return;
    const p = pickAt(ev.clientX, ev.clientY);
    select(p);
    opts.onPick(p);
  };
  let lastHover = 0;
  const onMove = (ev: PointerEvent) => {
    if (down || ev.pointerType !== "mouse") return;
    const now = performance.now();
    if (now - lastHover < 120) return;
    lastHover = now;
    renderer.domElement.style.cursor = pickAt(ev.clientX, ev.clientY) ? "pointer" : "";
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointermove", onMove);

  const ro = new ResizeObserver(() => {
    if (!host.clientWidth || !host.clientHeight) return;
    renderer.setSize(host.clientWidth, host.clientHeight);
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
  });
  ro.observe(host);

  // --- plekken in de stad -------------------------------------------------
  const randomHouse = (): Place => houses.built[Math.floor(rnd() * houses.built.length)] ?? { road: EXITS.west };
  const companySlot = (id: string): Plot | undefined => COMPANY_SLOTS[data?.companies.findIndex((c) => c.id === id) ?? -1];
  const placeOf = (from: Origin): Place => {
    if (from === "oost" || from === "west") return { road: EXITS[from] };
    if (from === "woonwijk") return randomHouse();
    if (from.startsWith("bedrijf:")) return companySlot(from.slice(8)) ?? { road: EXITS.oost };
    return LANDMARKS[from as "bank" | "datacenter" | "magazijn" | "opleiding"];
  };

  // --- echte gebeurtenissen: voertuig → hoofdkantoor → robot naar de afdeling
  const queue: CityEvent[] = [];
  const couriers: { mover: Mover; g: THREE.Object3D }[] = [];
  let nextSpawn = 0;
  // afspelen van de laatste 24 uur: eigen wachtrij, live gebeurtenissen wachten zolang
  let replayQ: CityEvent[] = [];
  let onReplay: ((ev: CityEvent | null, left: number) => void) | null = null;
  const endReplay = () => {
    replayQ = [];
    const cb = onReplay;
    onReplay = null;
    cb?.(null, 0);
  };
  const spawnTrip = (now: number) => {
    const replaying = onReplay !== null;
    if (now < nextSpawn || trips.length >= (replaying ? 16 : MAX_TRIPS)) return;
    const ev = replaying ? replayQ.shift() : queue.shift();
    if (!ev) return;
    nextSpawn = now + (replaying ? 450 : 1800);
    if (replaying) {
      onReplay?.(ev, replayQ.length);
      if (replayQ.length === 0) endReplay();
    }
    const t = trafficFor(ev, companyIds);
    const from = placeOf(t.from);
    const { g } = vehicle(kit, t.kind, shadow, { severity: ev.severity });
    g.userData.pick = { kind: "event", id: ev.id } satisfies Pick;
    const mover = new Mover(g, laneOffset(tripCenter(from, LANDMARKS.hq), LANE_CAR), SPEED_CAR * (replaying ? 2.2 : 1), ROAD_TOP);
    scene.add(g);
    trips.push({ mover, g, ev, from, back: false, wait: 0, replay: replaying });
    refreshPickables();
  };
  const spawnCourier = (ev: CityEvent) => {
    if (couriers.length >= 6) return;
    const r = roomOf(ev.room);
    const g = robot(kit, 0x475569, shadow, 0.85);
    const parcel = kit.box(0.42, 0.32, 0.42, kit.mat(sevColor(ev.severity), { emissive: sevColor(ev.severity), emissiveIntensity: 0.35 }), 0, 1.55, 0.05, false);
    g.add(parcel);
    office.layer.group.add(g);
    couriers.push({ mover: new Mover(g, courierRoute(r.cx, r.cy), SPEED_WALK, 0.12), g });
  };

  // --- gewoon verkeer: drukker als er meer mensen aan het werk zijn ---------
  const ambient: { mover: Mover; g: THREE.Object3D; at: Place }[] = [];
  const ambientPlaces = (): Place[] => [
    LANDMARKS.hq,
    LANDMARKS.bank,
    LANDMARKS.datacenter,
    LANDMARKS.magazijn,
    LANDMARKS.opleiding,
    LANDMARKS.park,
    ...COMPANY_SLOTS.slice(0, data?.companies.length ?? 0),
    ...houses.built.slice(0, 12),
    { road: EXITS.oost },
    { road: EXITS.west },
  ];
  const ambientWanted = () => 3 + Math.min(9, data?.workers.workingNow ?? 0);
  const ambientTrip = (from: Place): { path: Pt[]; to: Place } => {
    const all = ambientPlaces().filter((p) => p !== from);
    const to = all[Math.floor(rnd() * all.length)] ?? LANDMARKS.hq;
    return { path: laneOffset(tripCenter(from, to), LANE_CAR), to };
  };
  const syncAmbient = () => {
    while (ambient.length < ambientWanted()) {
      const places = ambientPlaces();
      const from = places[Math.floor(rnd() * places.length)] ?? LANDMARKS.hq;
      const { path, to } = ambientTrip(from);
      const { g } = vehicle(kit, "verkeer", shadow, { color: TRAFFIC_COLORS[Math.floor(rnd() * TRAFFIC_COLORS.length)] ?? 0x94a3b8 });
      const mover = new Mover(g, path, SPEED_CAR * (0.8 + rnd() * 0.25), ROAD_TOP);
      // begin ergens halverwege, anders vertrekken ze allemaal tegelijk
      const head = Math.floor(40 * rnd());
      for (let k = 0; k < head; k++) mover.step(0.25);
      scene.add(g);
      ambient.push({ mover, g, at: to });
    }
  };

  // --- fietsers: wie nu een dienst heeft, fietst naar de opdrachtgever -------
  const parked = new Map<string, THREE.Object3D[]>();
  const riders: { mover: Mover; g: THREE.Object3D; company: string | null }[] = [];
  const bikeQueue: string[] = [];
  let nextBike = 0;
  const clearBikes = () => {
    parked.forEach((list) => list.forEach((b) => b.removeFromParent()));
    parked.clear();
    riders.forEach((r) => r.g.removeFromParent());
    riders.length = 0;
    bikeQueue.length = 0;
  };
  const onTheWay = (id: string) => riders.filter((r) => r.company === id).length + bikeQueue.filter((q) => q === id).length;
  const syncBikes = () => {
    for (const c of data?.companies ?? []) {
      const want = Math.min(8, c.workingNow);
      const have = (parked.get(c.id)?.length ?? 0) + onTheWay(c.id);
      for (let k = have; k < want; k++) bikeQueue.push(c.id);
      const list = parked.get(c.id) ?? [];
      // klaar met werken: fiets uit het rek, naar huis
      while (list.length > want) {
        const b = list.pop();
        const slot = companySlot(c.id);
        if (!b || !slot) break;
        b.removeFromParent();
        const g = bike(kit, TRAFFIC_COLORS[Math.floor(rnd() * TRAFFIC_COLORS.length)] ?? 0x1e3a8a, shadow);
        riders.push({ mover: new Mover(g, laneOffset(tripCenter(slot, randomHouse()), LANE_BIKE), SPEED_BIKE, ROAD_TOP), g, company: null });
        scene.add(g);
      }
    }
  };
  const spawnBike = (now: number) => {
    if (now < nextBike) return;
    const id = bikeQueue.shift();
    if (!id) return;
    nextBike = now + 900;
    const slot = companySlot(id);
    const spot = companies.racks.get(id)?.[(parked.get(id)?.length ?? 0) + riders.filter((r) => r.company === id).length];
    if (!slot || !spot) return;
    const colors = [0xf97316, 0x2563eb, 0x16a34a, 0xdb2777, 0x0f172a, 0xeab308];
    const g = bike(kit, colors[Math.floor(rnd() * colors.length)] ?? 0x2563eb, shadow);
    const path = laneOffset(tripCenter(randomHouse(), slot), LANE_BIKE);
    path.push([spot[0], spot[1] - 0.8], spot);
    riders.push({ mover: new Mover(g, path, SPEED_BIKE, ROAD_TOP), g, company: id });
    scene.add(g);
  };

  // --- rondvaartboten -----------------------------------------------------
  const boats = [
    { g: boat(kit, 0x1e3a8a), dir: 1, z: 83.3, speed: 2.4 },
    { g: boat(kit, 0x7c2d12), dir: -1, z: 85.3, speed: 2 },
  ];
  boats.forEach((b, k) => {
    b.g.position.set(k ? 60 : -80, -0.5, b.z);
    b.g.rotation.y = b.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(b.g);
  });

  // --- gegevens -----------------------------------------------------------
  const setData = (d: CityData) => {
    data = d;
    companyIds = new Set(d.companies.map((c) => c.id));
    const sig = JSON.stringify(d.companies.map((c) => [c.id, c.name, companyFloors(c), c.workingNow > 0 ? 2 : c.openShifts + c.shiftsWeek > 0 ? 1 : 0, c.openShifts > 0]));
    let changed = false;
    if (sig !== sigCompanies) {
      const order = d.companies.map((c) => c.id).join(",");
      // een klant kreeg een ander pand: fietsen opnieuw laten aankomen
      if (order !== orderCompanies) clearBikes();
      companies.layer.dispose();
      companies = buildCompanies(kit, d.companies, win);
      scene.add(companies.layer.group);
      sigCompanies = sig;
      orderCompanies = order;
      changed = true;
    }
    const n = houseCount(d.workers.total);
    if (n !== sigHouses) {
      houses.layer.dispose();
      houses = buildHouses(kit, n);
      scene.add(houses.layer.group);
      sigHouses = n;
      changed = true;
    }
    const dk = `${Math.min(3, d.shop.toShip)}:${Math.min(12, d.shop.ordersToday)}`;
    if (dk !== sigDock) {
      dock.dispose();
      dock = buildDock(kit, d.shop.toShip, d.shop.ordersToday, shadow);
      scene.add(dock.group);
      sigDock = dk;
      changed = true;
    }
    if (changed) {
      refreshPickables();
      applyDaylight();
    }
    refreshLabels();
    syncAmbient();
    syncBikes();
  };

  // --- dag en nacht -------------------------------------------------------
  let phase: "dag" | "schemer" | "nacht" = "dag";
  const applyDaylight = () => {
    const s = sunAt(new Date());
    phase = dayPhase(s.elevation);
    const el = Math.max(0.14, s.elevation);
    sun.position.set(s.dir[0] * Math.cos(el) * 150, Math.sin(el) * 150, s.dir[1] * Math.cos(el) * 150);
    const warm = new THREE.Color(0xffc28a).lerp(new THREE.Color(0xffffff), Math.min(1, Math.max(0, s.elevation) / 0.5));
    sun.color.copy(warm);
    sun.intensity = phase === "dag" ? 0.7 + 0.9 * Math.min(1, s.elevation / 0.8) : phase === "schemer" ? 0.45 : 0;
    moon.intensity = phase === "nacht" ? 0.35 : phase === "schemer" ? 0.12 : 0;
    hemi.intensity = phase === "dag" ? 1.25 : phase === "schemer" ? 0.75 : 0.32;
    hemi.color.setHex(phase === "nacht" ? 0x8ea2d8 : 0xffffff);
    const [top, bottom] = phase === "dag" ? ["#7fb8e6", "#dcecf7"] : phase === "schemer" ? ["#334a7d", "#f2b48a"] : ["#030712", "#1b2747"];
    sky.paint(top, bottom);
    (scene.fog as THREE.Fog).color.set(bottom);
    stars.visible = phase === "nacht";
    const key = phase === "dag" ? "day" : phase === "schemer" ? "dusk" : "night";
    for (const l of layers()) for (const g of l.glows) g.m.emissiveIntensity = g[key];
    renderer.shadowMap.needsUpdate = true;
  };
  applyDaylight();
  const dayTimer = setInterval(applyDaylight, 60_000);

  // --- tekenen ------------------------------------------------------------
  let visible = true;
  const io = new IntersectionObserver((e) => (visible = e.some((x) => x.isIntersecting)));
  io.observe(host);
  const beaconRed = kit.mat(0xdc2626, { emissive: 0xdc2626, emissiveIntensity: 1 });
  const beaconAmber = kit.mat(0xf59e0b, { emissive: 0xf59e0b, emissiveIntensity: 1 });
  const beaconGreen = kit.mat(0x22c55e, { emissive: 0x22c55e, emissiveIntensity: 1 });
  const v = new THREE.Vector3();
  let last = performance.now();
  let frame = 0;
  // Loopt het niet vloeiend (onder ~30 beelden per seconde), dan minder scherp tekenen.
  let ratio = Math.min(window.devicePixelRatio, 2);
  let perfSum = 0;
  let perfN = 0;

  const tick = () => {
    frame = requestAnimationFrame(tick);
    const now = performance.now();
    const raw = now - last;
    const dt = Math.min(0.05, raw / 1000);
    last = now;
    if (!visible || document.hidden) return;
    if (raw < 250) {
      perfSum += raw;
      perfN += 1;
    }
    if (perfN >= 120) {
      if (perfSum / perfN > 33 && ratio > 1) {
        ratio = Math.max(1, ratio - 0.5);
        renderer.setPixelRatio(ratio);
        renderer.setSize(host.clientWidth, host.clientHeight);
      }
      perfSum = 0;
      perfN = 0;
    }
    const bob = (speed: number, phaseOff: number, moving: boolean) => (reduced ? 0 : Math.abs(Math.sin(now / speed + phaseOff)) * (moving ? 0.08 : 0.015));

    // robots in het kantoor lopen rond in hun eigen afdeling
    for (const s of office.staff) {
      const [rx, rz] = roomCenter(s.room.cx, s.room.cy);
      if (now > s.until) {
        s.target = [rx + (Math.random() - 0.5) * 7, rz + (Math.random() - 0.2) * 4.5];
        s.until = now + 3000 + Math.random() * 6000;
      }
      const dx = s.target[0] - s.g.position.x;
      const dz = s.target[1] - s.g.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.05) {
        const step = Math.min(dist, 1.2 * dt);
        s.g.position.x += (dx / dist) * step;
        s.g.position.z += (dz / dist) * step;
        s.g.rotation.y = Math.atan2(dx, dz);
      }
      s.g.position.y = 0.12 + bob(260, s.phase, dist > 0.05);
    }

    spawnTrip(now);
    const cars = [...trips.map((t) => t.mover), ...ambient.map((a) => a.mover)];
    for (let i = trips.length - 1; i >= 0; i--) {
      const t = trips[i];
      if (!t) continue;
      if (t.wait > 0) {
        t.wait -= dt;
        continue;
      }
      if (tooClose(t.mover, cars) || !t.mover.step(dt)) continue;
      // aangekomen bij het hoofdkantoor: de robot neemt het pakketje over
      if (!t.back) spawnCourier(t.ev);
      if (!t.back && !t.replay) {
        t.back = true;
        t.wait = 0.9;
        t.mover.reroute(laneOffset(tripCenter(LANDMARKS.hq, t.from), LANE_CAR));
      } else {
        t.g.removeFromParent();
        trips.splice(i, 1);
        refreshPickables();
      }
    }
    // een gekozen voertuig: de ring rijdt mee en de camera schuift mee
    if (follow) {
      if (!follow.parent) {
        follow = null;
        ring.visible = false;
      } else {
        ring.position.set(follow.position.x, ROAD_TOP + 0.05, follow.position.z);
        if (followCam && !fly) {
          const k = Math.min(1, dt * 3);
          const dx = (follow.position.x - controls.target.x) * k;
          const dz = (follow.position.z - controls.target.z) * k;
          controls.target.x += dx;
          controls.target.z += dz;
          camera.position.x += dx;
          camera.position.z += dz;
        }
      }
    }
    for (let i = couriers.length - 1; i >= 0; i--) {
      const c = couriers[i];
      if (!c) continue;
      if (c.mover.step(dt)) {
        c.g.removeFromParent();
        couriers.splice(i, 1);
      } else c.g.position.y = 0.12 + (reduced ? 0 : Math.abs(Math.sin(now / 160)) * 0.1);
    }
    for (let i = ambient.length - 1; i >= 0; i--) {
      const a = ambient[i];
      if (!a || tooClose(a.mover, cars) || !a.mover.step(dt)) continue;
      if (ambient.length > ambientWanted()) {
        a.g.removeFromParent();
        ambient.splice(i, 1);
        continue;
      }
      const next = ambientTrip(a.at);
      a.at = next.to;
      a.mover.reroute(next.path);
    }
    spawnBike(now);
    for (let i = riders.length - 1; i >= 0; i--) {
      const r = riders[i];
      if (!r || !r.mover.step(dt)) continue;
      r.g.removeFromParent();
      riders.splice(i, 1);
      if (!r.company) continue;
      const list = parked.get(r.company) ?? [];
      const spot = companies.racks.get(r.company)?.[list.length];
      if (!spot) continue;
      const b = bike(kit, 0x334155, shadow, false);
      b.position.set(spot[0], SLAB + 0.06, spot[1]);
      scene.add(b);
      list.push(b);
      parked.set(r.company, list);
    }
    for (const b of boats) {
      b.g.position.x += b.dir * b.speed * dt;
      if (b.g.position.x > 160) b.g.position.x = -160;
      if (b.g.position.x < -160) b.g.position.x = 160;
    }

    // molen, koelers, munt, knipperlichten, bouwkraan
    if (!reduced) {
      world.sails.rotation.z -= dt * millSpeed(data?.eventsLastHour ?? 0);
      const calls = data?.ai.callsToday ?? 0;
      for (const f of world.fans) f.rotation.y += dt * (2 + Math.min(6, calls / 20));
      world.coin.rotation.y += dt * 0.9;
      const freq = 2 + Math.min(10, Math.sqrt(calls));
      world.leds.forEach((m, k) => (m.emissiveIntensity = 0.55 + 0.45 * Math.sin((now / 1000) * freq + k * 1.7)));
      if (companies.crane) companies.crane.rotation.y = Math.sin(now / 7000) * 0.9;
    }
    world.antenna.emissiveIntensity = now % 1400 < 180 ? 2.2 : 0.15;
    beaconRed.emissiveIntensity = now % 640 < 320 ? 1.8 : 0.2;
    beaconAmber.emissiveIntensity = now % 900 < 450 ? 1.5 : 0.25;
    beaconGreen.emissiveIntensity = 0.6 + 0.6 * Math.abs(Math.sin(now / 700));
    world.coinMat.emissiveIntensity = 0.2 + Math.min(0.8, (data?.money.paidToday ?? 0) * 0.12) + (phase === "nacht" ? 0.3 : 0);
    if (ring.visible) ringMat.opacity = 0.45 + 0.35 * Math.abs(Math.sin(now / 500));

    // camera: vlucht, rondleiding, en niet buiten de stad laten dwalen
    if (touring && now > nextTourAt) {
      flyTo(TOUR[tourStep % TOUR.length] ?? "stad");
      tourStep += 1;
      nextTourAt = now + 6500;
    }
    if (fly) {
      const k = Math.min(1, (now - fly.start) / fly.dur);
      const e = ease(k);
      camera.position.lerpVectors(fly.p0, fly.p1, e);
      camera.position.y += Math.sin(k * Math.PI) * fly.p0.distanceTo(fly.p1) * 0.12;
      controls.target.lerpVectors(fly.t0, fly.t1, e);
      if (k >= 1) fly = null;
    }
    controls.target.x = Math.max(-120, Math.min(120, controls.target.x));
    controls.target.z = Math.max(-110, Math.min(110, controls.target.z));
    controls.target.y = Math.max(0, Math.min(20, controls.target.y));
    controls.update();
    renderer.render(scene, camera);

    const w = host.clientWidth;
    const h = host.clientHeight;
    placed.length = 0;
    const sel = labels.get(selectedKey);
    for (const l of sel ? [sel, ...order.filter((x) => x !== sel)] : order) {
      const d = camera.position.distanceTo(l.a.pos);
      // dichtbij staan de afdelingsnamen er; dan hoeft "Hoofdkantoor" er niet over
      const near = l.a.key === "landmark:hq" ? d >= 78 : true;
      const show = l === sel || (near && (l.a.tier === "room" ? d < 78 : l.a.tier === "company" ? d < 165 : d < 420));
      v.copy(l.a.pos).project(camera);
      const x = ((v.x + 1) / 2) * w;
      const y = ((1 - v.y) / 2) * h;
      const box: [number, number, number, number] = [x - l.w / 2 - 2, y - l.h - 2, x + l.w / 2 + 2, y + 2];
      const overlaps = placed.some((p) => box[0] < p[2] && box[2] > p[0] && box[1] < p[3] && box[3] > p[1]);
      if (!show || v.z >= 1 || overlaps) {
        l.el.style.display = "none";
        continue;
      }
      placed.push(box);
      l.el.style.display = "";
      l.el.style.left = `${x}px`;
      l.el.style.top = `${y}px`;
    }
  };
  const placed: [number, number, number, number][] = [];
  tick();

  return {
    setData,
    pushEvents: (evs) => queue.push(...evs),
    replay(evs, onStep) {
      if (onReplay) endReplay();
      if (evs.length === 0) return onStep(null, 0);
      replayQ = [...evs];
      onReplay = onStep;
      nextSpawn = 0;
    },
    stopReplay: endReplay,
    fly: flyTo,
    tour(on) {
      touring = on;
      if (on) {
        tourStep = 0;
        nextTourAt = 0;
      } else fly = null;
    },
    select,
    dispose() {
      cancelAnimationFrame(frame);
      clearInterval(dayTimer);
      ro.disconnect();
      io.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointermove", onMove);
      for (const l of layers()) l.dispose();
      kit.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.forEach((l) => l.el.remove());
      labels.clear();
    },
  };
}
