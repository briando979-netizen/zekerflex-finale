"use client";

import { useEffect, useRef, useState } from "react";
import type { Mesh, Vector3 } from "three";
import type { MapCity } from "@/lib/shifts/open-map";
import type { SupplyCell } from "@/lib/shifts/supply-map";
import { NL_OUTLINE, OpenShiftsMap } from "@/components/marketing/OpenShiftsMap";
import { toPlane } from "@/lib/shifts/plane";

// 3D-kaart van Nederland: lichtzuilen voor open diensten (groen = open werk) en
// voor beschikbare krachten (blauw), hoogte = aantal. three.js uit de eigen
// bundel, pas geladen als de kaart in beeld komt; draaien, zoomen, aanwijzen
// voor details. Zonder WebGL: de platte kaart. Bij "minder beweging": geen
// automatisch draaien. Alleen echte, geaggregeerde cijfers.

const GREEN = 0x16a34a;
const BLUE = 0x2563eb;

type Hover = { x: number; y: number; title: string; lines: string[] } | null;
type Layers = { diensten: boolean; krachten: boolean };

const euro = (cents: number) => `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function OpenShifts3D({ cities, supply }: { cities: MapCity[]; supply: SupplyCell[] }) {
  const host = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  // start: de kaart is in beeld gekomen (eenmalig); mode: wat we tonen.
  const [start, setStart] = useState(false);
  const [mode, setMode] = useState<"laden" | "klaar" | "plat">("laden");
  const [layers, setLayers] = useState<Layers>({ diensten: true, krachten: true });
  const [hover, setHover] = useState<Hover>(null);
  const groups = useRef<{ diensten?: { visible: boolean }; krachten?: { visible: boolean } }>({});

  // Pas laden als de kaart in beeld komt.
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (!hasWebGL()) {
      setMode("plat");
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setStart(true);
        io.disconnect();
      }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (groups.current.diensten) groups.current.diensten.visible = layers.diensten;
    if (groups.current.krachten) groups.current.krachten.visible = layers.krachten;
  }, [layers]);

  useEffect(() => {
    if (!start) return;
    const el = host.current;
    const labelHost = labelsRef.current;
    if (!el || !labelHost) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.setAttribute("aria-hidden", "true");
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, el.clientWidth / el.clientHeight, 0.1, 500);
      camera.position.set(0, 30, 36);

      scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe7e2, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.6);
      sun.position.set(-14, 30, 18);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25 });
      scene.add(sun);

      // Nederland als dikke plaat, met een rand in de huisstijlkleur.
      const shape = new THREE.Shape(NL_OUTLINE.map(([lng, lat]) => new THREE.Vector2(...toPlane(lng, lat))));
      const landGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: true, bevelSize: 0.15, bevelThickness: 0.15, bevelSegments: 2 });
      const land = new THREE.Mesh(landGeo, new THREE.MeshStandardMaterial({ color: 0xe4f8ef, roughness: 0.85 }));
      land.rotation.x = -Math.PI / 2;
      land.receiveShadow = true;
      scene.add(land);
      const edge = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(NL_OUTLINE.map(([lng, lat]) => { const [x, y] = toPlane(lng, lat); return new THREE.Vector3(x, 0.96, -y); })),
        new THREE.LineBasicMaterial({ color: 0x0f766e }),
      );
      scene.add(edge);

      // Zuilen: hoogte naar de wortel van het aantal, zodat één grote stad de rest niet platdrukt.
      const pickable: Mesh[] = [];
      const labelPoints: { el: HTMLSpanElement; pos: Vector3 }[] = [];
      const maxAll = Math.max(1, ...cities.map((c) => c.count), ...supply.map((s) => s.count));
      const column = (x: number, z: number, count: number, color: number, radius: number, info: { title: string; lines: string[] }) => {
        const h = 0.8 + Math.sqrt(count / maxAll) * 10;
        const mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, h, 28),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.92 }),
        );
        mesh.position.set(x, 0.95 + h / 2, z);
        mesh.castShadow = true;
        mesh.userData = info;
        pickable.push(mesh);
        return { mesh, top: new THREE.Vector3(x, 0.95 + h + 0.5, z) };
      };

      const dienstenGroup = new THREE.Group();
      cities.forEach((c, i) => {
        const [x, y] = toPlane(c.lng, c.lat);
        const { mesh, top } = column(x, -y, c.count, GREEN, 0.38, {
          title: c.city,
          lines: [`${c.count} open ${c.count === 1 ? "dienst" : "diensten"}`, c.minRateCents ? (c.minRateCents === c.maxRateCents ? euro(c.minRateCents) + " per uur" : `${euro(c.minRateCents)} – ${euro(c.maxRateCents)} per uur`) : "", ...c.sampleTitles.slice(0, 2)].filter(Boolean),
        });
        dienstenGroup.add(mesh);
        if (i < 6) {
          const span = document.createElement("span");
          span.textContent = c.city;
          span.className = "pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold text-ink shadow-e1";
          labelHost.appendChild(span);
          labelPoints.push({ el: span, pos: top });
        }
      });
      const krachtenGroup = new THREE.Group();
      supply.forEach((s) => {
        const [x, y] = toPlane(s.lng, s.lat);
        krachtenGroup.add(column(x, -y, s.count, BLUE, 0.3, { title: "Beschikbare krachten", lines: [`${s.count} mensen wonen in deze regio`, "per vak van ongeveer 16 km"] }).mesh);
      });
      scene.add(dienstenGroup, krachtenGroup);
      groups.current = { diensten: dienstenGroup, krachten: krachtenGroup };
      dienstenGroup.visible = layers.diensten;
      krachtenGroup.visible = layers.krachten;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.minDistance = 16;
      controls.maxDistance = 80;
      controls.maxPolarAngle = 1.32;
      controls.target.set(0, 0, 0);
      controls.autoRotate = !reduced;
      controls.autoRotateSpeed = 0.5;
      controls.addEventListener("start", () => (controls.autoRotate = false));

      // Aanwijzen: details van de zuil onder de muis of vinger.
      const ray = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const onPointer = (ev: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        pointer.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(pointer, camera);
        const hit = ray.intersectObjects(pickable.filter((m) => m.parent?.visible), false)[0];
        if (hit) {
          const info = hit.object.userData as { title: string; lines: string[] };
          setHover({ x: ev.clientX - r.left, y: ev.clientY - r.top, ...info });
          renderer.domElement.style.cursor = "pointer";
        } else {
          setHover(null);
          renderer.domElement.style.cursor = "grab";
        }
      };
      renderer.domElement.addEventListener("pointermove", onPointer);
      renderer.domElement.addEventListener("pointerdown", onPointer);
      renderer.domElement.addEventListener("pointerleave", () => setHover(null));

      const ro = new ResizeObserver(() => {
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      ro.observe(el);

      // Alleen tekenen als de kaart zichtbaar is (spaart batterij).
      let visible = true;
      const io = new IntersectionObserver((e) => (visible = e.some((x) => x.isIntersecting)));
      io.observe(el);
      const v = new THREE.Vector3();
      let frame = 0;
      const tick = () => {
        frame = requestAnimationFrame(tick);
        if (!visible || document.hidden) return;
        controls.update();
        renderer.render(scene, camera);
        for (const l of labelPoints) {
          v.copy(l.pos).project(camera);
          const show = v.z < 1 && dienstenGroup.visible;
          l.el.style.display = show ? "" : "none";
          l.el.style.left = `${((v.x + 1) / 2) * el.clientWidth}px`;
          l.el.style.top = `${((1 - v.y) / 2) * el.clientHeight}px`;
        }
      };
      tick();
      setMode("klaar");

      cleanup = () => {
        cancelAnimationFrame(frame);
        ro.disconnect();
        io.disconnect();
        controls.dispose();
        scene.traverse((o) => {
          const m = o as { geometry?: { dispose: () => void }; material?: { dispose: () => void } };
          m.geometry?.dispose();
          m.material?.dispose();
        });
        renderer.dispose();
        renderer.domElement.remove();
        labelPoints.forEach((l) => l.el.remove());
      };
    })().catch(() => !disposed && setMode("plat"));

    return () => {
      disposed = true;
      cleanup();
    };
    // De lagen worden via groups.current bijgewerkt, niet door de scène opnieuw te bouwen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, cities, supply]);

  if (mode === "plat") return <OpenShiftsMap cities={cities} />;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {([
          ["diensten", "Open diensten", "bg-[#16a34a]"],
          ["krachten", "Beschikbare krachten", "bg-[#2563eb]"],
        ] as const).map(([key, label, dot]) => (
          <button
            key={key}
            type="button"
            aria-pressed={layers[key]}
            onClick={() => setLayers((l) => ({ ...l, [key]: !l[key] }))}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition ${layers[key] ? "border-ink bg-white text-ink" : "border-hairstrong bg-transparent text-neutralx-500"}`}
          >
            <span className={`h-2.5 w-2.5 rounded-full ${dot} ${layers[key] ? "" : "opacity-30"}`} aria-hidden />
            {label}
          </button>
        ))}
        <span className="text-xs text-neutralx-500">Sleep om te draaien · scroll of knijp om te zoomen · wijs een zuil aan voor details</span>
      </div>
      <div
        ref={host}
        className="relative h-[62vh] min-h-[380px] w-full touch-none overflow-hidden rounded-3xl border border-hair bg-gradient-to-b from-white to-paper-soft"
        role="img"
        aria-label={`3D-kaart van Nederland met ${cities.reduce((s, c) => s + c.count, 0)} open diensten in ${cities.length} plaatsen en beschikbare krachten in ${supply.length} regio's`}
      >
        <div ref={labelsRef} className="pointer-events-none absolute inset-0" />
        {mode !== "klaar" && (
          <div className="absolute inset-0 grid place-items-center" role="status">
            <span className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-ink shadow-e1">3D-kaart laden…</span>
          </div>
        )}
        {hover && (
          <div className="pointer-events-none absolute z-10 max-w-[16rem] rounded-xl border border-hair bg-white px-3 py-2 text-sm shadow-e2" style={{ left: Math.max(8, Math.min(hover.x + 14, (host.current?.clientWidth ?? 0) - 270)), top: hover.y + 14 }}>
            <p className="font-semibold text-ink">{hover.title}</p>
            {hover.lines.map((l) => (
              <p key={l} className="text-xs text-neutralx-600">{l}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
