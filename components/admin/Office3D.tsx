"use client";

import { useEffect, useRef, useState } from "react";
import type { Group, Mesh, Object3D, Vector3 } from "three";
import { Empty, Panel, Pill } from "@/components/admin/kit";
import { courierRoute, FRONT_Z, GAP, RD, roomCenter, RW } from "@/lib/admin/office3d-layout";

// ---------------------------------------------------------------------------
// Live kantoor in 3D: dezelfde negen afdelingen en dezelfde échte gebeurtenissen
// als de 2D-plattegrond (OfficeSim, /api/admin/office). Elke afdeling heeft
// muren met een deur, bureaus met schermen en robots die rondlopen. Voor elke
// nieuwe gebeurtenis uit het auditspoor loopt een koerier met een pakketje van
// de voordeur door de gangen naar de afdeling die hem afhandelde (rood =
// kritiek, oranje = waarschuwing). Klik een afdeling voor zijn gebeurtenissen.
// Dag en nacht volgen de klok in Amsterdam. three.js laadt pas op deze pagina.
// ---------------------------------------------------------------------------

interface Ev {
  id: string;
  room: string;
  action: string;
  summary: string;
  severity: string;
  by: string;
  at: string;
}

const ROOMS = [
  { id: "hq", name: "Hoofdkantoor · Jarvis", cx: 0, cy: 0, floor: 0xdfe6fb, accent: 0x4f6bed, staff: 2 },
  { id: "sales", name: "Sales & werving", cx: 1, cy: 0, floor: 0xebe4fb, accent: 0x8b5cf6, staff: 2 },
  { id: "operations", name: "Planning & uren", cx: 2, cy: 0, floor: 0xdcf5e4, accent: 0x16a34a, staff: 2 },
  { id: "finance", name: "Facturatie", cx: 0, cy: 1, floor: 0xd6f3e6, accent: 0x059669, staff: 2 },
  { id: "lobby", name: "Lobby & receptie", cx: 1, cy: 1, floor: 0xeef1f5, accent: 0x64748b, staff: 1 },
  { id: "bank", name: "ZekerFlex Bank", cx: 2, cy: 1, floor: 0xd3f2ee, accent: 0x0d9488, staff: 2 },
  { id: "shop", name: "Webshop & magazijn", cx: 0, cy: 2, floor: 0xf8eccd, accent: 0xd97706, staff: 2 },
  { id: "support", name: "Klantenservice & mail", cx: 1, cy: 2, floor: 0xdcedf8, accent: 0x0284c7, staff: 2 },
  { id: "legal", name: "Juridisch & compliance", cx: 2, cy: 2, floor: 0xf8e1ec, accent: 0xdb2777, staff: 2 },
] as const;
type RoomId = (typeof ROOMS)[number]["id"];
const roomOf = (id: string) => ROOMS.find((r) => r.id === id) ?? ROOMS[0];

const amsterdamHour = () => Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", hour12: false }));
const sevColor = (s: string) => (s === "critical" ? 0xdc2626 : s === "warning" ? 0xf59e0b : 0x334155);
const timeNl = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });

export function Office3D() {
  const host = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"laden" | "klaar" | "geen-webgl">("laden");
  const [events, setEvents] = useState<Ev[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<RoomId | null>(null);
  const queue = useRef<Ev[]>([]);
  const seen = useRef(new Set<string>());

  // Echte gebeurtenissen: elke 10 seconden ophalen; nieuwe gaan als koerier de wachtrij in.
  useEffect(() => {
    let first = true;
    const load = async () => {
      const r = await fetch("/api/admin/office", { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const d: { events: Ev[]; counts: Record<string, number> } = await r.json();
      setEvents(d.events);
      setCounts(d.counts);
      const fresh = d.events.filter((e) => !seen.current.has(e.id));
      fresh.forEach((e) => seen.current.add(e.id));
      queue.current.push(...(first ? fresh.slice(0, 6) : fresh).reverse());
      first = false;
    };
    void load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const el = host.current;
    const labelHost = labelsRef.current;
    if (!el || !labelHost) return;
    try {
      const c = document.createElement("canvas");
      if (!(c.getContext("webgl2") || c.getContext("webgl"))) {
        setState("geen-webgl");
        return;
      }
    } catch {
      setState("geen-webgl");
      return;
    }
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      if (disposed) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 400);
      camera.position.set(0, 38, 42);

      const hemi = new THREE.HemisphereLight(0xffffff, 0xd8dee8, 1.4);
      const sun = new THREE.DirectionalLight(0xffffff, 1.5);
      sun.position.set(-20, 40, 25);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30 });
      scene.add(hemi, sun);

      const mat = (color: number, extra: Record<string, unknown> = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...extra });
      const box = (w: number, h: number, d: number, m: InstanceType<typeof THREE.MeshStandardMaterial>, x: number, y: number, z: number) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
        b.position.set(x, y, z);
        b.castShadow = true;
        b.receiveShadow = true;
        return b;
      };

      // Buitenvloer met gangen.
      const ground = new THREE.Mesh(new THREE.BoxGeometry(3 * RW + 2 * GAP + 6, 0.2, FRONT_Z * 2 + 2), mat(0xf1f3f6));
      ground.position.set(0, -0.1, 1);
      ground.receiveShadow = true;
      scene.add(ground);

      const floors: Mesh[] = [];
      const lamps: InstanceType<typeof THREE.MeshStandardMaterial>[] = [];
      const wallMat = mat(0xffffff, { roughness: 0.6 });
      const labelPoints: { el: HTMLSpanElement; pos: Vector3; room: RoomId }[] = [];
      const staff: { g: Group; room: (typeof ROOMS)[number]; target: [number, number]; until: number; phase: number }[] = [];

      const robot = (color: number, scale = 1) => {
        const g = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32 * scale, 0.5 * scale, 4, 12), mat(color, { roughness: 0.45 }));
        body.position.y = 0.62 * scale;
        body.castShadow = true;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.28 * scale, 16, 12), mat(0xffffff, { roughness: 0.3 }));
        head.position.y = 1.25 * scale;
        head.castShadow = true;
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34 * scale, 0.1 * scale, 0.06 * scale), mat(0x0f172a, { emissive: 0x38bdf8, emissiveIntensity: 0.8 }));
        visor.position.set(0, 1.27 * scale, 0.25 * scale);
        g.add(body, head, visor);
        return g;
      };

      for (const r of ROOMS) {
        const [x, z] = roomCenter(r.cx, r.cy);
        const floor = box(RW, 0.12, RD, mat(r.floor), x, 0.06, z);
        floor.userData = { room: r.id };
        floors.push(floor);
        scene.add(floor);
        // Muren rondom, met een deur in het midden van de voorkant.
        const h = 1.1;
        const t = 0.18;
        scene.add(
          box(RW, h, t, wallMat, x, h / 2, z - RD / 2),
          box(t, h, RD, wallMat, x - RW / 2, h / 2, z),
          box(t, h, RD, wallMat, x + RW / 2, h / 2, z),
          box(RW / 2 - 1, h, t, wallMat, x - RW / 4 - 0.5, h / 2, z + RD / 2),
          box(RW / 2 - 1, h, t, wallMat, x + RW / 4 + 0.5, h / 2, z + RD / 2),
        );
        const stripe = box(RW, 0.06, t + 0.02, mat(r.accent, { emissive: r.accent, emissiveIntensity: 0.25 }), x, h + 0.03, z - RD / 2);
        stripe.castShadow = false;
        scene.add(stripe);
        // Bureaus met scherm (het scherm gloeit 's avonds), en een plant.
        for (const dx of [-2.2, 2.2]) {
          scene.add(box(2.2, 0.7, 1, mat(0xcbd5e1, { roughness: 0.5 }), x + dx, 0.35, z - 1.4));
          const screenMat = mat(0x0f172a, { emissive: r.accent, emissiveIntensity: 0.15 });
          lamps.push(screenMat);
          scene.add(box(0.9, 0.6, 0.06, screenMat, x + dx, 1.05, z - 1.75));
        }
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.4, 12), mat(0xa16207));
        pot.position.set(x - RW / 2 + 0.7, 0.2, z - RD / 2 + 0.7);
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), mat(0x22c55e));
        leaves.position.set(x - RW / 2 + 0.7, 0.75, z - RD / 2 + 0.7);
        leaves.castShadow = true;
        scene.add(pot, leaves);
        // Robots die rondlopen in hun eigen afdeling.
        for (let i = 0; i < r.staff; i++) {
          const g = robot(r.accent);
          g.position.set(x + (i ? 2.2 : -2.2), 0.12, z - 0.4);
          scene.add(g);
          staff.push({ g, room: r, target: [g.position.x, g.position.z], until: 0, phase: Math.random() * 6 });
        }
        const span = document.createElement("span");
        span.textContent = r.name;
        span.className = "pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold shadow";
        span.style.background = "rgba(255,255,255,.92)";
        span.style.color = "#0f172a";
        labelHost.appendChild(span);
        labelPoints.push({ el: span, pos: new THREE.Vector3(x, 2.2, z - RD / 2), room: r.id });
      }

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.minDistance = 18;
      controls.maxDistance = 90;
      controls.maxPolarAngle = 1.3;
      controls.autoRotate = !reduced;
      controls.autoRotateSpeed = 0.35;
      controls.addEventListener("start", () => (controls.autoRotate = false));

      // Klik op een afdeling: zijn gebeurtenissen tonen.
      const ray = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let downAt = 0;
      renderer.domElement.addEventListener("pointerdown", () => (downAt = performance.now()));
      renderer.domElement.addEventListener("pointerup", (ev) => {
        if (performance.now() - downAt > 300) return; // slepen is draaien, geen klik
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
        ray.setFromCamera(pointer, camera);
        const hit = ray.intersectObjects(floors, false)[0];
        setSelected(hit ? ((hit.object.userData as { room: RoomId }).room) : null);
      });

      const ro = new ResizeObserver(() => {
        if (!el.clientWidth || !el.clientHeight) return;
        renderer.setSize(el.clientWidth, el.clientHeight);
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
      });
      ro.observe(el);

      // Koeriers: echte gebeurtenissen lopen van de voordeur naar hun afdeling.
      const couriers: { g: Object3D; route: [number, number][]; leg: number }[] = [];
      let nextSpawn = 0;
      const spawn = (now: number) => {
        if (now < nextSpawn || couriers.length >= 6) return;
        const ev = queue.current.shift();
        if (!ev) return;
        nextSpawn = now + 2500;
        const r = roomOf(ev.room);
        const g = robot(0x475569, 0.85);
        const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.32, 0.42), mat(sevColor(ev.severity), { emissive: sevColor(ev.severity), emissiveIntensity: 0.35 }));
        parcel.position.set(0, 1.55, 0.05);
        parcel.castShadow = true;
        g.add(parcel);
        const route = courierRoute(r.cx, r.cy);
        g.position.set(route[0]?.[0] ?? 0, 0.12, route[0]?.[1] ?? FRONT_Z);
        scene.add(g);
        couriers.push({ g, route, leg: 1 });
      };

      const setDaylight = () => {
        const h = amsterdamHour();
        const night = h < 7 || h >= 20;
        const dusk = !night && (h < 8 || h >= 18);
        hemi.intensity = night ? 0.45 : dusk ? 0.9 : 1.4;
        sun.intensity = night ? 0.25 : dusk ? 0.9 : 1.5;
        renderer.setClearColor(night ? 0x0f172a : dusk ? 0xf3d9c7 : 0xf8fafc);
        for (const l of lamps) l.emissiveIntensity = night ? 1.1 : dusk ? 0.6 : 0.15;
      };
      setDaylight();
      const dayTimer = setInterval(setDaylight, 60_000);

      let visible = true;
      const io = new IntersectionObserver((e) => (visible = e.some((x) => x.isIntersecting)));
      io.observe(el);
      const v = new THREE.Vector3();
      let last = performance.now();
      let frame = 0;
      const tick = () => {
        frame = requestAnimationFrame(tick);
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!visible || document.hidden) return;

        for (const s of staff) {
          const [rx, rz] = roomCenter(s.room.cx, s.room.cy);
          if (now > s.until) {
            s.target = [rx + (Math.random() - 0.5) * (RW - 3), rz + (Math.random() - 0.2) * (RD - 3.5)];
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
          s.g.position.y = 0.12 + (reduced ? 0 : Math.abs(Math.sin(now / 260 + s.phase)) * (dist > 0.05 ? 0.08 : 0.015));
        }

        spawn(now);
        for (let i = couriers.length - 1; i >= 0; i--) {
          const c = couriers[i];
          if (!c) continue;
          const target = c.route[c.leg];
          if (!target) {
            scene.remove(c.g);
            couriers.splice(i, 1);
            continue;
          }
          const dx = target[0] - c.g.position.x;
          const dz = target[1] - c.g.position.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.1) {
            c.leg += 1;
            continue;
          }
          const step = Math.min(dist, 3.2 * dt);
          c.g.position.x += (dx / dist) * step;
          c.g.position.z += (dz / dist) * step;
          c.g.rotation.y = Math.atan2(dx, dz);
          c.g.position.y = 0.12 + (reduced ? 0 : Math.abs(Math.sin(now / 160)) * 0.1);
        }

        controls.update();
        renderer.render(scene, camera);
        for (const l of labelPoints) {
          v.copy(l.pos).project(camera);
          l.el.style.display = v.z < 1 ? "" : "none";
          l.el.style.left = `${((v.x + 1) / 2) * el.clientWidth}px`;
          l.el.style.top = `${((1 - v.y) / 2) * el.clientHeight}px`;
        }
      };
      tick();
      setState("klaar");

      cleanup = () => {
        cancelAnimationFrame(frame);
        clearInterval(dayTimer);
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
    })().catch(() => !disposed && setState("geen-webgl"));

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  if (state === "geen-webgl") {
    return <Panel title="Kantoor in 3D"><Empty title="Deze browser kan geen 3D tonen" body="Gebruik de plattegrond (2D) hierboven." /></Panel>;
  }

  const room = selected ? roomOf(selected) : null;
  const roomEvents = selected ? events.filter((e) => (e.room === "ai" ? "hq" : e.room) === selected) : [];
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div
        ref={host}
        className="relative h-[66vh] min-h-[420px] overflow-hidden rounded-xl border"
        style={{ borderColor: "var(--a-border)" }}
        role="img"
        aria-label={`Kantoor in 3D met ${ROOMS.length} afdelingen en ${events.length} echte gebeurtenissen van de laatste 24 uur`}
      >
        <div ref={labelsRef} className="pointer-events-none absolute inset-0" />
        {state === "laden" && (
          <div className="absolute inset-0 grid place-items-center" role="status">
            <span className="rounded-full px-3 py-1.5 text-xs font-medium shadow" style={{ background: "var(--a-panel)", color: "var(--a-text)" }}>Kantoor laden…</span>
          </div>
        )}
        <p className="pointer-events-none absolute bottom-3 left-3 rounded-full px-3 py-1 text-[11px] shadow" style={{ background: "var(--a-panel)", color: "var(--a-dim)" }}>
          Sleep om te draaien · scroll om te zoomen · klik een afdeling
        </p>
      </div>
      <Panel
        title={room ? room.name : "Laatste gebeurtenissen"}
        subtitle={room ? `${counts[room.id] ?? 0} in de laatste 24 uur` : "Echte gebeurtenissen; elke koerier brengt er één weg"}
        {...(room ? { actions: <button type="button" className="a-button text-xs" onClick={() => setSelected(null)}>Alles</button> } : {})}
      >
        {(room ? roomEvents : events).length === 0 ? (
          <Empty title={room ? "Hier gebeurde nog niets" : "Nog geen gebeurtenissen"} body="De laatste 24 uur." />
        ) : (
          <ul className="max-h-[56vh] space-y-2 overflow-y-auto pr-1">
            {(room ? roomEvents : events).slice(0, 30).map((e) => (
              <li key={e.id} className="text-[0.8125rem]">
                <div className="flex items-center gap-2">
                  <Pill tone={e.severity === "critical" ? "crit" : e.severity === "warning" ? "warn" : "neutral"}>{timeNl(e.at)}</Pill>
                  {!room && <span className="truncate text-xs" style={{ color: "var(--a-mute)" }}>{roomOf(e.room === "ai" ? "hq" : e.room).name}</span>}
                </div>
                <p className="mt-0.5" style={{ color: "var(--a-text)" }}>{e.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
