"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Live kantoor — an isometric, physical world: nine departments with walls,
// doors, corridors and furniture. Robots path-find around walls (A*), steer
// with acceleration and braking, and avoid bumping into each other. Staff
// work at their desks, fetch coffee and visit colleagues; at night most go to
// their charging dock. Every courier is a REAL event from the audit trail (an
// order, approved hours, a bank top-up …): it enters at the front door, checks
// in at reception and carries the parcel to the department that handled it.
// Day, dusk and night follow the real clock in Amsterdam.
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

// ---- world layout ---------------------------------------------------------
const RW = 10; // room footprint incl. walls
const RH = 8;
const GAP = 2; // corridor width between rooms
const MARGIN = 3; // outer wall + a 2-tile corridor around the building
const W = 2 * MARGIN + 3 * RW + 2 * GAP; // 40
const H = 2 * MARGIN + 3 * RH + 2 * GAP; // 34

type Kind = "desk" | "plant" | "rack" | "shelf" | "books" | "screen" | "reception" | "sofa" | "coffee" | "dock" | "board" | "vault";
interface Furn {
  kind: Kind;
  x: number;
  y: number;
  w: number;
  d: number;
}
interface RoomDef {
  id: string;
  name: string;
  short: string;
  cx: number;
  cy: number;
  floor: string;
  accent: string;
  staff: string[];
}

const ROOMS: RoomDef[] = [
  { id: "hq", name: "Hoofdkantoor · Jarvis", short: "Jarvis", cx: 0, cy: 0, floor: "#dfe6fb", accent: "#4f6bed", staff: ["Jarvis", "Analist"] },
  { id: "sales", name: "Sales & werving", short: "Sales", cx: 1, cy: 0, floor: "#ebe4fb", accent: "#8b5cf6", staff: ["Recruiter", "Accountmanager"] },
  { id: "operations", name: "Planning & uren", short: "Planning", cx: 2, cy: 0, floor: "#dcf5e4", accent: "#16a34a", staff: ["Planner", "Urencontroleur"] },
  { id: "finance", name: "Facturatie", short: "Facturatie", cx: 0, cy: 1, floor: "#d6f3e6", accent: "#059669", staff: ["Boekhouder", "Debiteuren"] },
  { id: "lobby", name: "Lobby & receptie", short: "Lobby", cx: 1, cy: 1, floor: "#eef1f5", accent: "#64748b", staff: ["Receptionist"] },
  { id: "bank", name: "ZekerFlex Bank", short: "Bank", cx: 2, cy: 1, floor: "#d3f2ee", accent: "#0d9488", staff: ["Kassier", "Risicobewaker"] },
  { id: "shop", name: "Webshop & magazijn", short: "Magazijn", cx: 0, cy: 2, floor: "#f8eccd", accent: "#d97706", staff: ["Orderpicker", "Inpakker"] },
  { id: "support", name: "Klantenservice & mail", short: "Service", cx: 1, cy: 2, floor: "#dcedf8", accent: "#0284c7", staff: ["Helpdesk", "Mailbot"] },
  { id: "legal", name: "Juridisch & compliance", short: "Juridisch", cx: 2, cy: 2, floor: "#f8e1ec", accent: "#db2777", staff: ["Jurist", "Compliance"] },
];
const ROOM = new Map(ROOMS.map((r) => [r.id, r]));
const origin = (r: RoomDef) => ({ x: MARGIN + r.cx * (RW + GAP), y: MARGIN + r.cy * (RH + GAP) });

/** Furniture in room-local coordinates (interior is x 1..8, y 1..6). */
function furnitureFor(r: RoomDef): Furn[] {
  const o = origin(r);
  const at = (kind: Kind, x: number, y: number, w = 1, d = 1): Furn => ({ kind, x: o.x + x, y: o.y + y, w, d });
  const desks = [at("desk", 2, 2, 2, 1), at("desk", 6, 2, 2, 1)];
  const common = [at("plant", 1, 1), at("dock", 8, 6)];
  switch (r.id) {
    case "hq":
      return [...desks, ...common, at("screen", 4, 1, 2, 1)];
    case "sales":
      return [...desks, ...common, at("board", 4, 1, 2, 1)];
    case "operations":
      return [...desks, ...common, at("board", 4, 1, 2, 1)];
    case "finance":
      return [...desks, ...common, at("books", 4, 1, 2, 1)];
    case "bank":
      return [...desks, ...common, at("vault", 4, 5, 2, 1), at("rack", 1, 5)];
    case "shop":
      return [at("desk", 2, 2, 2, 1), ...common, at("shelf", 5, 1, 3, 1), at("shelf", 5, 4, 3, 1)];
    case "support":
      return [...desks, ...common, at("screen", 4, 1, 2, 1)];
    case "legal":
      return [...desks, ...common, at("books", 4, 1, 3, 1)];
    case "lobby":
      return [at("reception", 4, 3, 2, 1), at("sofa", 1, 5, 2, 1), at("coffee", 8, 1), at("plant", 1, 1), at("plant", 8, 6)];
    default:
      return desks;
  }
}
const FURNITURE = ROOMS.flatMap(furnitureFor);

// walkability grid
const WALL = new Uint8Array(W * H); // 1 = wall
const BLOCK = new Uint8Array(W * H); // 1 = furniture
const idx = (x: number, y: number) => y * W + x;
// front door at the bottom of the corridor that leads up to the lobby
const ENTRANCE = { x: MARGIN + RW, y: H - 1 };
for (let x = 0; x < W; x++) {
  WALL[idx(x, 0)] = 1;
  WALL[idx(x, H - 1)] = 1;
}
for (let y = 0; y < H; y++) {
  WALL[idx(0, y)] = 1;
  WALL[idx(W - 1, y)] = 1;
}
WALL[idx(ENTRANCE.x, ENTRANCE.y)] = 0;
const DOORS: { x: number; y: number }[] = [];
for (const r of ROOMS) {
  const o = origin(r);
  for (let x = 0; x < RW; x++) {
    WALL[idx(o.x + x, o.y)] = 1;
    WALL[idx(o.x + x, o.y + RH - 1)] = 1;
  }
  for (let y = 0; y < RH; y++) {
    WALL[idx(o.x, o.y + y)] = 1;
    WALL[idx(o.x + RW - 1, o.y + y)] = 1;
  }
  for (const d of [
    { x: o.x + 4, y: o.y },
    { x: o.x + 5, y: o.y + RH - 1 },
    { x: o.x, y: o.y + 3 },
    { x: o.x + RW - 1, y: o.y + 4 },
  ]) {
    WALL[idx(d.x, d.y)] = 0;
    DOORS.push(d);
  }
}
for (const f of FURNITURE) {
  if (f.kind === "dock") continue; // you stand on a charging pad
  for (let x = 0; x < f.w; x++) for (let y = 0; y < f.d; y++) BLOCK[idx(f.x + x, f.y + y)] = 1;
}
const walkable = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !WALL[idx(x, y)] && !BLOCK[idx(x, y)];

/** A* on the tile grid, 8 directions without cutting corners. */
function findPath(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] {
  const start = idx(sx, sy);
  const goal = idx(tx, ty);
  if (start === goal) return [];
  const g = new Float32Array(W * H).fill(Infinity);
  const f = new Float32Array(W * H).fill(Infinity);
  const from = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const open: number[] = [start];
  const h = (i: number) => {
    const dx = Math.abs((i % W) - tx);
    const dy = Math.abs(Math.floor(i / W) - ty);
    return Math.max(dx, dy) + 0.41 * Math.min(dx, dy);
  };
  g[start] = 0;
  f[start] = h(start);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f[open[i]!]! < f[open[bi]!]!) bi = i;
    const cur = open.splice(bi, 1)[0]!;
    if (cur === goal) break;
    closed[cur] = 1;
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!walkable(nx, ny) && idx(nx, ny) !== goal) continue;
        if (dx && dy && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;
        const ni = idx(nx, ny);
        if (closed[ni]) continue;
        const ng = g[cur]! + (dx && dy ? 1.414 : 1);
        if (ng < g[ni]!) {
          g[ni] = ng;
          f[ni] = ng + h(ni);
          from[ni] = cur;
          if (!open.includes(ni)) open.push(ni);
        }
      }
  }
  if (from[goal] === -1) return [];
  const out: { x: number; y: number }[] = [];
  for (let c = goal; c !== start && c !== -1; c = from[c]!) out.push({ x: (c % W) + 0.5, y: Math.floor(c / W) + 0.5 });
  return out.reverse();
}

// ---- agents ---------------------------------------------------------------
type Mode = "work" | "walk" | "pause" | "sleep";
interface Agent {
  id: number;
  name: string;
  room: string;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  path: { x: number; y: number }[];
  mode: Mode;
  until: number;
  seat: { x: number; y: number };
  dock: { x: number; y: number };
  activity: string;
  courier?: { ev: Ev; stage: "in" | "reception" | "deliver" | "show" | "out" };
  stuck: number;
}

const seatsFor = (r: RoomDef) => FURNITURE.filter((f) => f.kind === "desk" && ROOM.get(r.id) === r && f.x >= origin(r).x && f.x < origin(r).x + RW && f.y >= origin(r).y && f.y < origin(r).y + RH).map((d) => ({ x: d.x + 0.5 + (d.w > 1 ? 0.5 : 0), y: d.y + 1.5 }));
const dockFor = (r: RoomDef) => {
  const d = FURNITURE.find((f) => f.kind === "dock" && f.x >= origin(r).x && f.x < origin(r).x + RW && f.y >= origin(r).y && f.y < origin(r).y + RH);
  return d ? { x: d.x + 0.5, y: d.y + 0.5 } : { x: origin(r).x + 4.5, y: origin(r).y + 4.5 };
};
const lobby = ROOM.get("lobby")!;
const RECEPTION = { x: origin(lobby).x + 5, y: origin(lobby).y + 4.6 };
const COFFEE = { x: origin(lobby).x + 7.5, y: origin(lobby).y + 1.6 };
const inboxFor = (roomId: string) => {
  const r = ROOM.get(roomId) ?? ROOM.get("hq")!;
  const o = origin(r);
  return { x: o.x + 4.5, y: o.y + 4.5 };
};
const randomFloor = (r: RoomDef) => {
  const o = origin(r);
  for (let i = 0; i < 30; i++) {
    const x = o.x + 1 + Math.floor(Math.random() * (RW - 2));
    const y = o.y + 1 + Math.floor(Math.random() * (RH - 2));
    if (walkable(x, y)) return { x: x + 0.5, y: y + 0.5 };
  }
  return { x: o.x + 4.5, y: o.y + 4.5 };
};

function amsterdamHour(now: Date): number {
  const p = new Intl.DateTimeFormat("nl-NL", { hour: "numeric", minute: "numeric", hourCycle: "h23", timeZone: "Europe/Amsterdam" }).formatToParts(now);
  return Number(p.find((x) => x.type === "hour")?.value ?? 12) + Number(p.find((x) => x.type === "minute")?.value ?? 0) / 60;
}
/** 0 = full night … 1 = full day, with dawn 6–8 and dusk 19–21. */
const daylight = (h: number) => (h < 6 || h >= 21 ? 0 : h < 8 ? (h - 6) / 2 : h < 19 ? 1 : 1 - (h - 19) / 2);
const mix = (a: string, b: string, t: number) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t)).join(",")})`;
};
const shade = (hex: string, f: number) => {
  const p = [1, 3, 5].map((i) => Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(i, i + 2), 16) * f))));
  return `rgb(${p.join(",")})`;
};

interface Sel {
  name: string;
  room: string;
  activity: string;
  summary?: string;
}

export function OfficeSim() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [clock, setClock] = useState(() => new Date());
  const [sel, setSel] = useState<Sel | null>(null);
  const [stats, setStats] = useState({ working: 0, walking: 0, sleeping: 0, couriers: 0 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const agents = useRef<Agent[]>([]);
  const queue = useRef<Ev[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const countsRef = useRef<Record<string, number>>({});
  const view = useRef({ zoom: 1, panX: 0, panY: 0 });
  const selId = useRef<number | null>(null);
  const hourOverride = useRef<number | null>(null);

  // optional ?uur=22 to preview night/dusk
  useEffect(() => {
    const u = new URLSearchParams(window.location.search).get("uur");
    if (u !== null && !Number.isNaN(Number(u))) hourOverride.current = Math.max(0, Math.min(23.99, Number(u)));
  }, []);
  const hourNow = useCallback(() => hourOverride.current ?? amsterdamHour(new Date()), []);

  // staff
  useEffect(() => {
    let id = 1;
    const list: Agent[] = [];
    for (const r of ROOMS) {
      const seats = seatsFor(r);
      r.staff.forEach((name, i) => {
        const seat = r.id === "lobby" ? { x: RECEPTION.x, y: RECEPTION.y - 2.1 } : (seats[i % Math.max(1, seats.length)] ?? randomFloor(r));
        list.push({ id: id++, name, room: r.id, color: r.accent, x: seat.x, y: seat.y, vx: 0, vy: 0, path: [], mode: "work", until: performance.now() + 2000 + Math.random() * 8000, seat, dock: dockFor(r), activity: "aan het werk", stuck: 0 });
      });
    }
    agents.current = list;
  }, []);

  // real activity feed
  useEffect(() => {
    let first = true;
    const load = async () => {
      const r = await fetch("/api/admin/office", { cache: "no-store" }).catch(() => null);
      if (!r?.ok) return;
      const d: { events: Ev[]; counts: Record<string, number> } = await r.json();
      setEvents(d.events);
      setCounts(d.counts);
      countsRef.current = d.counts;
      const fresh = d.events.filter((e) => !seen.current.has(e.id));
      fresh.forEach((e) => seen.current.add(e.id));
      queue.current.push(...(first ? fresh.slice(0, 6) : fresh).reverse());
      first = false;
    };
    void load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  // spawn a courier every few seconds from the queue
  useEffect(() => {
    let next = 1000;
    const t = setInterval(() => {
      setClock(new Date());
      const ev = queue.current.shift();
      if (!ev || agents.current.filter((a) => a.courier).length >= 6) return;
      const room = ROOM.get(ev.room) ?? ROOM.get("hq")!;
      agents.current.push({
        id: 10_000 + next++,
        name: "Koerier",
        room: room.id,
        color: ev.severity === "critical" ? "#dc2626" : ev.severity === "warning" ? "#f59e0b" : "#334155",
        x: ENTRANCE.x + 0.5,
        y: ENTRANCE.y + 0.5,
        vx: 0,
        vy: -0.5,
        path: findPath(ENTRANCE.x, ENTRANCE.y, Math.floor(RECEPTION.x), Math.floor(RECEPTION.y)),
        mode: "walk",
        until: 0,
        seat: RECEPTION,
        dock: { x: ENTRANCE.x + 0.5, y: ENTRANCE.y + 0.5 },
        activity: `brengt: ${ev.summary}`,
        courier: { ev, stage: "in" },
        stuck: 0,
      });
    }, 2800);
    return () => clearInterval(t);
  }, []);

  // ---- simulation + rendering loop ----------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let raf = 0;
    let last = performance.now();
    let statT = 0;
    let cssW = 0;
    let cssH = 0;
    let TW = 20;
    let ox = 0;
    let oy = 0;
    const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random() * 0.22, s: Math.random() }));

    // Isometric projection: X = (x - y)*TW/2, Y = (x + y)*TW/4 - z*TW/2.
    // The world is (W + H)*TW/2 wide; fit it to the width, zoom around the centre.
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cssW = wrap.clientWidth;
      const base = (cssW / ((W + H) / 2)) * 0.96;
      TW = base * view.current.zoom;
      cssH = Math.max(280, Math.round(((W + H) * base) / 4 + base * 5));
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ox = cssW / 2 - ((W - H) / 4) * TW + view.current.panX;
      oy = cssH / 2 + base * 1.6 - ((W + H) / 2) * (TW / 4) + view.current.panY;
    };
    const iso = (x: number, y: number, z = 0) => ({ sx: ox + (x - y) * (TW / 2), sy: oy + (x + y) * (TW / 4) - z * (TW / 2) });
    const unIso = (sx: number, sy: number) => {
      const a = (sx - ox) / (TW / 2);
      const b = (sy - oy) / (TW / 4);
      return { x: (a + b) / 2, y: (b - a) / 2 };
    };

    const poly = (pts: { sx: number; sy: number }[], fill: string, stroke?: string) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    };
    const box = (x: number, y: number, w: number, d: number, z0: number, hgt: number, top: string) => {
      const t = [iso(x, y, z0 + hgt), iso(x + w, y, z0 + hgt), iso(x + w, y + d, z0 + hgt), iso(x, y + d, z0 + hgt)];
      const left = [iso(x, y + d, z0), iso(x + w, y + d, z0), iso(x + w, y + d, z0 + hgt), iso(x, y + d, z0 + hgt)];
      const right = [iso(x + w, y, z0), iso(x + w, y + d, z0), iso(x + w, y + d, z0 + hgt), iso(x + w, y, z0 + hgt)];
      poly(left, shade(top, 0.78));
      poly(right, shade(top, 0.64));
      poly(t, top);
    };

    const drawFurniture = (f: Furn, night: number, glowOnly = false) => {
      const glow = (x: number, y: number, c: string) => {
        if (night < 0.2 || !glowOnly) return;
        const p = iso(x, y, 0.9);
        const g = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, TW * 2.2);
        g.addColorStop(0, c);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = g;
        ctx.fillRect(p.sx - TW * 2.2, p.sy - TW * 2.2, TW * 4.4, TW * 4.4);
        ctx.globalCompositeOperation = "source-over";
      };
      if (glowOnly) {
        if (f.kind === "desk") glow(f.x + f.w / 2, f.y + 0.6, `rgba(255,214,140,${0.35 * night})`);
        else if (f.kind === "screen") glow(f.x + f.w / 2, f.y + 0.6, `rgba(120,170,255,${0.4 * night})`);
        else if (f.kind === "reception") glow(f.x + f.w / 2, f.y + 0.5, `rgba(255,220,160,${0.4 * night})`);
        else if (f.kind === "dock") glow(f.x + 0.5, f.y + 0.5, `rgba(52,211,153,${0.3 * night})`);
        return;
      }
      switch (f.kind) {
        case "desk":
          box(f.x + 0.1, f.y + 0.15, f.w - 0.2, f.d - 0.3, 0, 0.55, "#c8a57a");
          box(f.x + 0.35, f.y + 0.2, 0.5, 0.12, 0.55, 0.38, "#1f2937");
          if (f.w > 1) box(f.x + 1.15, f.y + 0.2, 0.5, 0.12, 0.55, 0.38, "#1f2937");
          break;
        case "plant":
          box(f.x + 0.3, f.y + 0.3, 0.4, 0.4, 0, 0.35, "#a0522d");
          box(f.x + 0.15, f.y + 0.15, 0.7, 0.7, 0.35, 0.6, "#3f9d5a");
          break;
        case "rack":
          box(f.x + 0.1, f.y + 0.1, 0.8, 0.8, 0, 1.6, "#334155");
          break;
        case "vault":
          box(f.x + 0.1, f.y + 0.1, f.w - 0.2, f.d - 0.2, 0, 1.2, "#94a3b8");
          break;
        case "shelf":
          box(f.x + 0.05, f.y + 0.2, f.w - 0.1, f.d - 0.4, 0, 1.3, "#b45309");
          for (let i = 0; i < f.w * 2; i++) box(f.x + 0.15 + i * 0.45, f.y + 0.25, 0.32, 0.4, 1.3, 0.22, i % 2 ? "#fbbf24" : "#d6b98c");
          break;
        case "books":
          box(f.x + 0.05, f.y + 0.1, f.w - 0.1, f.d - 0.5, 0, 1.4, "#7c3f1d");
          break;
        case "screen":
          box(f.x + 0.1, f.y + 0.1, f.w - 0.2, 0.15, 0.6, 1.0, "#0f172a");
          break;
        case "board":
          box(f.x + 0.1, f.y + 0.1, f.w - 0.2, 0.12, 0.3, 1.0, "#f8fafc");
          break;
        case "reception":
          box(f.x, f.y + 0.1, f.w, f.d - 0.2, 0, 0.75, "#e2e8f0");
          break;
        case "sofa":
          box(f.x + 0.05, f.y + 0.2, f.w - 0.1, f.d - 0.3, 0, 0.35, "#6366f1");
          box(f.x + 0.05, f.y + 0.6, f.w - 0.1, 0.3, 0.35, 0.35, "#4f46e5");
          break;
        case "coffee":
          box(f.x + 0.25, f.y + 0.25, 0.5, 0.5, 0, 0.9, "#111827");
          break;
        case "dock": {
          const c = iso(f.x + 0.5, f.y + 0.5);
          ctx.fillStyle = night > 0.3 ? "rgba(52,211,153,0.55)" : "rgba(16,185,129,0.35)";
          ctx.beginPath();
          ctx.ellipse(c.sx, c.sy, TW * 0.32, TW * 0.16, 0, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
    };

    const drawRobot = (a: Agent, t: number, night: number) => {
      const bob = reduce || a.mode === "sleep" ? 0 : Math.abs(Math.sin(t / 140 + a.id)) * (a.mode === "walk" ? 0.06 : 0.015);
      const p = iso(a.x, a.y);
      const s = TW * 0.36;
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, s * 0.7, s * 0.32, 0, 0, Math.PI * 2);
      ctx.fill();
      const y0 = p.sy - bob * TW;
      // body
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.roundRect(p.sx - s * 0.55, y0 - s * 1.55, s * 1.1, s * 1.15, s * 0.3);
      ctx.fill();
      // head with screen face
      ctx.fillStyle = "#e5e7eb";
      ctx.beginPath();
      ctx.roundRect(p.sx - s * 0.6, y0 - s * 2.45, s * 1.2, s * 0.9, s * 0.28);
      ctx.fill();
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.roundRect(p.sx - s * 0.46, y0 - s * 2.32, s * 0.92, s * 0.62, s * 0.18);
      ctx.fill();
      const blink = (t / 1000 + a.id) % 4 < 0.12;
      const eyeOn = a.mode === "sleep" ? "rgba(52,211,153,0.35)" : "#34d399";
      ctx.fillStyle = eyeOn;
      const dir = Math.abs(a.vx) + Math.abs(a.vy) > 0.05 ? Math.sign(a.vx - a.vy) * s * 0.08 : 0;
      for (const ex of [-0.2, 0.2]) {
        ctx.beginPath();
        if (blink || a.mode === "sleep") ctx.fillRect(p.sx + ex * s + dir - s * 0.08, y0 - s * 2.02, s * 0.16, s * 0.04);
        else ctx.arc(p.sx + ex * s + dir, y0 - s * 2.0, s * 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      // antenna
      ctx.strokeStyle = "#9ca3af";
      ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.beginPath();
      ctx.moveTo(p.sx, y0 - s * 2.45);
      ctx.lineTo(p.sx, y0 - s * 2.75);
      ctx.stroke();
      ctx.fillStyle = a.courier && a.courier.ev.severity === "critical" ? ((t / 250) % 2 < 1 ? "#ef4444" : "#7f1d1d") : (t / 600 + a.id) % 2 < 1 ? "#f43f5e" : "#fda4af";
      ctx.beginPath();
      ctx.arc(p.sx, y0 - s * 2.8, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      // parcel
      if (a.courier && a.courier.stage !== "out") {
        ctx.fillStyle = "#d6a35c";
        ctx.fillRect(p.sx - s * 0.32, y0 - s * 1.3, s * 0.64, s * 0.5);
        ctx.strokeStyle = "#92622a";
        ctx.strokeRect(p.sx - s * 0.32, y0 - s * 1.3, s * 0.64, s * 0.5);
      }
      if (a.mode === "sleep") {
        ctx.fillStyle = night > 0.3 ? "#cbd5e1" : "#475569";
        ctx.font = `${Math.max(8, s * 0.6)}px sans-serif`;
        ctx.fillText("z", p.sx + s * 0.6, y0 - s * 2.6 - ((t / 400) % 3) * 2);
      }
      if (selId.current === a.id) {
        ctx.strokeStyle = "#10b981";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(p.sx, p.sy, s * 0.95, s * 0.45, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // speech bubble when a courier delivers
      if (a.courier?.stage === "show") {
        const text = a.courier.ev.summary.length > 60 ? `${a.courier.ev.summary.slice(0, 58)}…` : a.courier.ev.summary;
        ctx.font = `600 ${Math.max(10, Math.min(13, TW * 0.42))}px system-ui, sans-serif`;
        const w = Math.min(cssW * 0.7, ctx.measureText(text).width + 16);
        const bx = Math.min(Math.max(6, p.sx - w / 2), cssW - w - 6);
        const by = y0 - s * 3.3 - 26;
        ctx.fillStyle = "rgba(255,255,255,0.96)";
        ctx.beginPath();
        ctx.roundRect(bx, by, w, 24, 8);
        ctx.fill();
        ctx.fillStyle = "#0f172a";
        ctx.save();
        ctx.beginPath();
        ctx.rect(bx + 8, by, w - 16, 24);
        ctx.clip();
        ctx.fillText(text, bx + 8, by + 16);
        ctx.restore();
      }
    };

    const stepAgent = (a: Agent, dt: number, now: number, night: boolean) => {
      // decide
      if (a.mode !== "walk" && now > a.until && !a.courier) {
        if (night && a.room !== "lobby" && Math.random() < 0.75) {
          a.path = findPath(Math.floor(a.x), Math.floor(a.y), Math.floor(a.dock.x), Math.floor(a.dock.y));
          a.mode = a.path.length ? "walk" : "sleep";
          a.activity = "naar het laadstation";
          a.until = now + 60_000;
          (a as Agent & { next?: Mode }).next = "sleep";
        } else {
          const roll = Math.random();
          const r = ROOM.get(a.room)!;
          let target = a.seat;
          let label = "terug naar het bureau";
          let next: Mode = "work";
          const atSeat = Math.hypot(a.x - a.seat.x, a.y - a.seat.y) < 0.6;
          if (atSeat && a.room !== "lobby") {
            if (roll < 0.12) {
              target = COFFEE;
              label = "koffie halen in de lobby";
              next = "pause";
            } else if (roll < 0.22) {
              const other = ROOMS[Math.floor(Math.random() * ROOMS.length)]!;
              target = randomFloor(other);
              label = `overleg bij ${other.short}`;
              next = "pause";
            } else if (roll < 0.3) {
              target = randomFloor(r);
              label = "even rondlopen";
              next = "pause";
            } else {
              a.until = now + 8000 + Math.random() * 14_000;
              a.activity = "aan het werk";
              return;
            }
          }
          a.path = findPath(Math.floor(a.x), Math.floor(a.y), Math.floor(target.x), Math.floor(target.y));
          if (a.path.length) {
            a.path[a.path.length - 1] = target;
            a.mode = "walk";
            a.activity = label;
            (a as Agent & { next?: Mode }).next = next;
          } else {
            a.mode = "work";
            a.until = now + 3000;
          }
        }
      }
      if (a.mode !== "walk") {
        a.vx *= 0.8;
        a.vy *= 0.8;
        return;
      }
      // steer towards next waypoint (acceleration + braking), avoid others
      const wp = a.path[0];
      if (!wp) {
        a.mode = (a as Agent & { next?: Mode }).next ?? "work";
        a.until = now + (a.mode === "pause" ? 2500 + Math.random() * 3000 : 5000 + Math.random() * 10_000);
        a.activity = a.mode === "sleep" ? "laadt op (nachtrust)" : a.mode === "pause" ? (a.activity.includes("koffie") ? "drinkt koffie" : "in overleg") : "aan het werk";
        if (a.courier) advanceCourier(a, now);
        return;
      }
      const dx = wp.x - a.x;
      const dy = wp.y - a.y;
      const dist = Math.hypot(dx, dy);
      const final = a.path.length === 1;
      const maxV = a.courier ? 2.6 : 1.9;
      const desired = final ? Math.min(maxV, dist * 2.2) : maxV;
      let ax = (dx / (dist || 1)) * desired - a.vx;
      let ay = (dy / (dist || 1)) * desired - a.vy;
      for (const b of agents.current) {
        if (b === a) continue;
        const ddx = a.x - b.x;
        const ddy = a.y - b.y;
        const dd = Math.hypot(ddx, ddy);
        if (dd > 0 && dd < 0.55) {
          // push apart, plus a small sidestep so two robots meeting head-on pass instead of stalling
          ax += (ddx / dd) * (0.55 - dd) * 5 + (-ddy / dd) * (0.55 - dd) * 2;
          ay += (ddy / dd) * (0.55 - dd) * 5 + (ddx / dd) * (0.55 - dd) * 2;
        }
      }
      const acc = 6;
      const al = Math.hypot(ax, ay);
      if (al > acc) {
        ax = (ax / al) * acc;
        ay = (ay / al) * acc;
      }
      a.vx += ax * dt;
      a.vy += ay * dt;
      const sp = Math.hypot(a.vx, a.vy);
      if (sp > maxV) {
        a.vx = (a.vx / sp) * maxV;
        a.vy = (a.vy / sp) * maxV;
      }
      const nx = a.x + a.vx * dt;
      const ny = a.y + a.vy * dt;
      // never walk through walls or furniture: slide along them instead
      const free = (x: number, y: number) => walkable(Math.floor(x), Math.floor(y)) || (Math.floor(x) === ENTRANCE.x && Math.floor(y) === ENTRANCE.y);
      if (free(nx, ny)) {
        a.x = nx;
        a.y = ny;
      } else if (free(nx, a.y)) {
        a.x = nx;
        a.vy *= 0.3;
      } else if (free(a.x, ny)) {
        a.y = ny;
        a.vx *= 0.3;
      } else {
        a.vx *= 0.2;
        a.vy *= 0.2;
      }
      if (dist < (final ? 0.08 : 0.35)) a.path.shift();
      // unstick: re-plan if barely moving for a while
      a.stuck = sp < 0.05 ? a.stuck + dt : 0;
      if (a.stuck > 2) {
        const goal = a.path[a.path.length - 1];
        if (goal) a.path = findPath(Math.floor(a.x), Math.floor(a.y), Math.floor(goal.x), Math.floor(goal.y));
        a.stuck = 0;
      }
    };

    const advanceCourier = (a: Agent, now: number) => {
      const c = a.courier!;
      if (c.stage === "in") {
        c.stage = "reception";
        a.mode = "pause";
        a.until = now + 700;
        a.activity = "meldt zich bij de receptie";
        setTimeout(() => {
          const to = inboxFor(c.ev.room);
          c.stage = "deliver";
          a.path = findPath(Math.floor(a.x), Math.floor(a.y), Math.floor(to.x), Math.floor(to.y));
          a.mode = "walk";
          a.activity = `brengt naar ${ROOM.get(c.ev.room)?.short ?? c.ev.room}: ${c.ev.summary}`;
        }, 700);
      } else if (c.stage === "deliver") {
        c.stage = "show";
        a.mode = "pause";
        a.activity = `afgeleverd: ${c.ev.summary}`;
        setTimeout(() => {
          c.stage = "out";
          a.path = findPath(Math.floor(a.x), Math.floor(a.y), ENTRANCE.x, ENTRANCE.y);
          a.mode = "walk";
          a.activity = "terug naar buiten";
        }, 5500);
      } else if (c.stage === "out") {
        agents.current = agents.current.filter((x) => x !== a);
      }
    };

    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const hour = hourNow();
      const day = daylight(hour);
      const night = 1 - day;
      const isNight = hour < 7 || hour >= 20;
      for (const a of [...agents.current]) stepAgent(a, dt, t, isNight);

      // sky
      const top = day > 0.95 ? "#9cc9f5" : day < 0.05 ? "#0b1226" : hour < 12 ? mix("#2a2a5a", "#f7a76c", day) : mix("#1e1b4b", "#f08a5d", day);
      const bottom = day > 0.95 ? "#e8f3fd" : day < 0.05 ? "#1a2340" : mix("#2b2f5c", "#ffd7a8", day);
      const sky = ctx.createLinearGradient(0, 0, 0, cssH);
      sky.addColorStop(0, top);
      sky.addColorStop(1, bottom);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, cssW, cssH);
      if (night > 0.5)
        for (const s of stars) {
          ctx.fillStyle = `rgba(255,255,255,${(night - 0.5) * 1.6 * (0.4 + 0.6 * Math.abs(Math.sin(t / 900 + s.s * 9)))})`;
          ctx.fillRect(s.x * cssW, s.y * cssH, 1.5, 1.5);
        }
      // ground + corridor floor
      poly([iso(0, 0), iso(W, 0), iso(W, H), iso(0, H)], mix("#1f2937", "#cfd6de", day));
      for (const r of ROOMS) {
        const o = origin(r);
        const busy = countsRef.current[r.id] ?? 0;
        poly([iso(o.x, o.y), iso(o.x + RW, o.y), iso(o.x + RW, o.y + RH), iso(o.x, o.y + RH)], mix("#273449", r.floor, day), busy ? r.accent : undefined);
      }
      // walls (low "cutaway" walls so you can look inside), sorted back-to-front
      const wallH = 0.55;
      for (let s = 0; s < W + H; s++)
        for (let x = 0; x <= s; x++) {
          const y = s - x;
          if (x >= W || y >= H || !WALL[idx(x, y)]) continue;
          box(x, y, 1, 1, 0, wallH, day > 0.5 ? "#f1f5f9" : mix("#334155", "#f1f5f9", day));
        }
      // furniture and robots together, depth-sorted
      const drawables: { d: number; fn: () => void }[] = [];
      for (const f of FURNITURE) drawables.push({ d: f.x + f.w / 2 + f.y + f.d / 2, fn: () => drawFurniture(f, night) });
      for (const a of agents.current) drawables.push({ d: a.x + a.y + 0.2, fn: () => drawRobot(a, t, night) });
      drawables.sort((p, q) => p.d - q.d);
      // night: dim the scene, then let lamps, screens and the robots' faces glow through
      for (const dr of drawables) dr.fn();
      if (night > 0.05) {
        ctx.fillStyle = `rgba(8,12,30,${0.5 * night})`;
        ctx.fillRect(0, 0, cssW, cssH);
        for (const f of FURNITURE) drawFurniture(f, night, true);
        for (const a of [...agents.current].sort((p, q) => p.x + p.y - (q.x + q.y))) drawRobot(a, t, night);
      }
      // room signs
      ctx.textAlign = "center";
      for (const r of ROOMS) {
        const o = origin(r);
        const p = iso(o.x + 0.6, o.y + RH / 2, 1.1);
        const n = countsRef.current[r.id] ?? 0;
        const label = `${r.short}${n ? ` · ${n}` : ""}`;
        ctx.font = `700 ${Math.max(9, Math.min(13, TW * 0.5))}px system-ui, sans-serif`;
        const w = ctx.measureText(label).width + 12;
        ctx.fillStyle = night > 0.5 ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.roundRect(p.sx - w / 2, p.sy - 11, w, 18, 9);
        ctx.fill();
        ctx.fillStyle = r.accent;
        ctx.fillText(label, p.sx, p.sy + 2);
      }
      ctx.textAlign = "start";
      // entrance mat
      const e = iso(ENTRANCE.x + 0.5, ENTRANCE.y + 0.5);
      ctx.fillStyle = "#10b981";
      ctx.font = `700 ${Math.max(9, TW * 0.4)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("ingang", e.sx, e.sy + TW * 0.7);
      ctx.textAlign = "start";

      statT += dt;
      if (statT > 0.5) {
        statT = 0;
        const list = agents.current;
        setStats({
          working: list.filter((a) => !a.courier && a.mode === "work").length,
          walking: list.filter((a) => !a.courier && (a.mode === "walk" || a.mode === "pause")).length,
          sleeping: list.filter((a) => a.mode === "sleep").length,
          couriers: list.filter((a) => a.courier).length,
        });
        const s = list.find((a) => a.id === selId.current);
        if (s) setSel({ name: s.name, room: ROOM.get(s.room)?.name ?? s.room, activity: s.activity, ...(s.courier ? { summary: s.courier.ev.summary } : {}) });
        else if (selId.current !== null) {
          selId.current = null;
          setSel(null);
        }
      }
      raf = document.hidden ? 0 : requestAnimationFrame(frame);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const onVis = () => {
      if (!document.hidden && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);

    // click a robot to see what it is doing; drag to pan
    let drag: { x: number; y: number; px: number; py: number; moved: boolean } | null = null;
    const down = (ev: PointerEvent) => {
      drag = { x: ev.clientX, y: ev.clientY, px: view.current.panX, py: view.current.panY, moved: false };
    };
    const move = (ev: PointerEvent) => {
      if (!drag) return;
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved && view.current.zoom > 1) {
        view.current.panX = drag.px + dx;
        view.current.panY = drag.py + dy;
        resize();
      }
    };
    const up = (ev: PointerEvent) => {
      if (drag && !drag.moved) {
        const rect = canvas.getBoundingClientRect();
        const mx = ev.clientX - rect.left;
        const my = ev.clientY - rect.top;
        let best: Agent | null = null;
        let bd = TW * 0.9;
        for (const a of agents.current) {
          const p = iso(a.x, a.y);
          const d = Math.hypot(p.sx - mx, p.sy - TW * 0.5 - my);
          if (d < bd) {
            bd = d;
            best = a;
          }
        }
        selId.current = best?.id ?? null;
        if (!best) {
          const w = unIso(mx, my);
          const r = ROOMS.find((rr) => {
            const o = origin(rr);
            return w.x >= o.x && w.x < o.x + RW && w.y >= o.y && w.y < o.y + RH;
          });
          setSel(r ? { name: r.name, room: r.name, activity: `${r.staff.length} robot${r.staff.length === 1 ? "" : "s"} · ${countsRef.current[r.id] ?? 0} gebeurtenissen vandaag` } : null);
        }
      }
      drag = null;
    };
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    (canvas as HTMLCanvasElement & { __zoom?: (f: number) => void }).__zoom = (f: number) => {
      view.current.zoom = Math.max(1, Math.min(3, view.current.zoom * f));
      if (view.current.zoom === 1) {
        view.current.panX = 0;
        view.current.panY = 0;
      }
      resize();
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [hourNow]);

  const zoom = (f: number) => (canvasRef.current as (HTMLCanvasElement & { __zoom?: (f: number) => void }) | null)?.__zoom?.(f);
  const hour = hourOverride.current ?? amsterdamHour(clock);
  const night = hour < 7 || hour >= 20;
  const busiest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--a-dim)" }}>
        <span className="rounded-full px-3 py-1 font-mono" style={{ background: "var(--a-panel-2)", color: "var(--a-text)" }}>
          {night ? "🌙" : hour < 8 || hour >= 19 ? "🌅" : "☀️"} {clock.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" })}
        </span>
        <span>{events.length} echte gebeurtenissen in de laatste 24 uur</span>
        {busiest && <span>· drukst: {ROOM.get(busiest[0])?.name ?? busiest[0]} ({busiest[1]})</span>}
      </div>

      <div ref={wrapRef} className="relative w-full overflow-hidden rounded-3xl border" style={{ borderColor: "var(--a-border)" }}>
        <canvas
          ref={canvasRef}
          className="block w-full touch-none select-none"
          style={{ cursor: "pointer" }}
          role="img"
          aria-label={`Live kantoor: ${stats.working} robots aan het werk, ${stats.walking} onderweg, ${stats.sleeping} aan het opladen, ${stats.couriers} koeriers met echte gebeurtenissen. Het logboek hieronder bevat dezelfde gebeurtenissen als tekst.`}
        />
        <div className="absolute right-3 top-3 flex flex-col gap-1.5">
          <button type="button" onClick={() => zoom(1.35)} className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-lg font-bold text-slate-800 shadow" aria-label="Inzoomen">
            +
          </button>
          <button type="button" onClick={() => zoom(1 / 1.35)} className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-lg font-bold text-slate-800 shadow" aria-label="Uitzoomen">
            −
          </button>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-1.5 text-[11px] font-semibold">
          <span className="rounded-full bg-white/90 px-2 py-0.5 text-slate-700">💻 {stats.working} aan het werk</span>
          <span className="rounded-full bg-white/90 px-2 py-0.5 text-slate-700">🚶 {stats.walking} onderweg</span>
          {stats.sleeping > 0 && <span className="rounded-full bg-white/90 px-2 py-0.5 text-slate-700">🔋 {stats.sleeping} laden op</span>}
          <span className="rounded-full bg-white/90 px-2 py-0.5 text-slate-700">📦 {stats.couriers} koeriers</span>
        </div>
      </div>

      <div className="a-panel min-h-[64px] p-4 text-sm" aria-live="polite">
        {sel ? (
          <p style={{ color: "var(--a-text)" }}>
            <strong>{sel.name}</strong> <span style={{ color: "var(--a-mute)" }}>· {sel.room}</span>
            <br />
            {sel.activity}
          </p>
        ) : (
          <p style={{ color: "var(--a-mute)" }}>Klik op een robot of afdeling om te zien wat er gebeurt. Zoom in met + en sleep om rond te kijken.</p>
        )}
      </div>

      <div className="a-panel p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--a-mute)" }}>
          Logboek — wat de afdelingen echt deden
        </p>
        {events.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen activiteit in de laatste 24 uur.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="w-12 flex-shrink-0 font-mono text-xs" style={{ color: "var(--a-mute)" }}>
                  {new Date(e.at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="flex-shrink-0 font-semibold" style={{ color: ROOM.get(e.room)?.accent ?? "var(--a-text)" }}>
                  {ROOM.get(e.room)?.short ?? "•"}
                </span>
                <span style={{ color: e.severity === "critical" ? "#dc2626" : e.severity === "warning" ? "#d97706" : "var(--a-text)" }}>{e.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
