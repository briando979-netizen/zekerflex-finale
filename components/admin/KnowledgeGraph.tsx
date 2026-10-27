"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent, WheelEvent as RWheelEvent } from "react";

// Obsidian-achtige force-directed grafiek van de kennisbank. Eigen, lichte
// physics (geen dependency): afstoting tussen nodes, veren langs edges, lichte
// zwaartekracht naar het midden, met cooling. Slepen pint een node, hover licht
// buren op, klik opent de bron. Wheel = zoom, slepen op de achtergrond = pan.

type GNode = { id: string; label: string; group: string; size: number; href?: string };
type GEdge = { source: string; target: string; weight: number };

const GROUP_COLOR: Record<string, string> = {
  intern: "#7CC5FF",
  kennisbank: "#4FE0A0",
  blog: "#FFC46B",
  whitepaper: "#C9A5FF",
  faq: "#F5B9AE",
  "wet-dba": "#9EE6C9",
  help: "#73D2C0",
  howto: "#B6C2CC",
  overig: "#8A938C",
};
const GROUP_LABEL: Record<string, string> = {
  intern: "Interne platformdocs",
  kennisbank: "Kennisbank-gidsen",
  blog: "Blog",
  whitepaper: "Whitepapers",
  faq: "FAQ",
  "wet-dba": "Wet DBA",
  help: "Helpcentrum",
  howto: "Hulp in de app",
  overig: "Overig",
};
const colorOf = (g: string) => GROUP_COLOR[g] ?? "#8A938C";

const W = 1000;
const H = 700;

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function KnowledgeGraph({ nodes, edges }: { nodes: GNode[]; edges: GEdge[] }) {
  const idx = useMemo(() => new Map(nodes.map((n, i) => [n.id, i])), [nodes]);
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const n of nodes) m.set(n.id, new Set());
    for (const e of edges) {
      m.get(e.source)?.add(e.target);
      m.get(e.target)?.add(e.source);
    }
    return m;
  }, [nodes, edges]);

  const pos = useRef<P[]>([]);
  const alpha = useRef(1);
  const raf = useRef<number | null>(null);
  const drag = useRef<{ i: number; moved: boolean } | null>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const [, force] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;

  // init positions in a ring, seeded deterministically
  if (pos.current.length !== nodes.length) {
    pos.current = nodes.map((_, i) => {
      const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      const r = 180 + ((i * 53) % 120);
      return { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r, vx: 0, vy: 0 };
    });
  }

  const tick = useCallback(() => {
    const p = pos.current;
    const n = p.length;
    const a = alpha.current;
    // repulsion (O(n^2), fine for <~120 nodes)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = p[i]!.x - p[j]!.x;
        let dy = p[i]!.y - p[j]!.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          d2 = 1;
          dx = (i - j) || 1;
          dy = 1;
        }
        const f = (6500 * a) / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        p[i]!.vx += fx;
        p[i]!.vy += fy;
        p[j]!.vx -= fx;
        p[j]!.vy -= fy;
      }
    }
    // springs along edges
    for (const e of edges) {
      const i = idx.get(e.source);
      const j = idx.get(e.target);
      if (i === undefined || j === undefined) continue;
      const dx = p[j]!.x - p[i]!.x;
      const dy = p[j]!.y - p[i]!.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const rest = 90;
      const f = 0.02 * a * (d - rest);
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      p[i]!.vx += fx;
      p[i]!.vy += fy;
      p[j]!.vx -= fx;
      p[j]!.vy -= fy;
    }
    // gravity to centre + integrate
    const dragI = drag.current?.i ?? -1;
    for (let i = 0; i < n; i++) {
      if (i === dragI) continue;
      p[i]!.vx += (W / 2 - p[i]!.x) * 0.008 * a;
      p[i]!.vy += (H / 2 - p[i]!.y) * 0.008 * a;
      p[i]!.vx *= 0.82;
      p[i]!.vy *= 0.82;
      p[i]!.x += Math.max(-30, Math.min(30, p[i]!.vx));
      p[i]!.y += Math.max(-30, Math.min(30, p[i]!.vy));
    }
    alpha.current = Math.max(0.02, a * 0.985);
    force((v) => v + 1);
    if (alpha.current > 0.025 || drag.current) raf.current = requestAnimationFrame(tick);
    else raf.current = null;
  }, [edges, idx]);

  const kick = useCallback(
    (a = 0.6) => {
      alpha.current = Math.max(alpha.current, a);
      if (raf.current === null) raf.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  useEffect(() => {
    kick(1);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // map a pointer event to SVG user coordinates (accounting for zoom/pan)
  const toLocal = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    const sy = ((clientY - r.top) / r.height) * H;
    const v = viewRef.current;
    return { x: (sx - v.tx) / v.scale, y: (sy - v.ty) / v.scale };
  };

  const onNodeDown = (i: number) => (e: RPointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { i, moved: false };
    kick(0.3);
  };
  const onMove = (e: RPointerEvent) => {
    if (drag.current) {
      const { x, y } = toLocal(e.clientX, e.clientY);
      const p = pos.current[drag.current.i]!;
      p.x = x;
      p.y = y;
      p.vx = 0;
      p.vy = 0;
      drag.current.moved = true;
      kick(0.3);
    } else if (pan.current) {
      const dx = e.clientX - pan.current.x;
      const dy = e.clientY - pan.current.y;
      setView((v) => ({ ...v, tx: pan.current!.tx + dx, ty: pan.current!.ty + dy }));
    }
  };
  const onUp = (e: RPointerEvent, node?: GNode) => {
    if (drag.current && node && !drag.current.moved && node.href) {
      window.open(node.href, "_blank", "noopener");
    }
    drag.current = null;
    pan.current = null;
  };
  const onBgDown = (e: RPointerEvent) => {
    pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
  };
  const onWheel = (e: RWheelEvent) => {
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setView((v) => ({ ...v, scale: Math.max(0.3, Math.min(3, v.scale * factor)) }));
  };

  const p = pos.current;
  const groups = [...new Set(nodes.map((n) => n.group))];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e13]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 px-4 py-2 text-[11px] text-white/50">
        <span className="font-semibold text-white/80">{nodes.length} documenten · {edges.length} verbanden</span>
        {groups.map((g) => (
          <span key={g} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: colorOf(g) }} />
            {GROUP_LABEL[g] ?? g}
          </span>
        ))}
        <span className="ml-auto text-white/30">sleep een node · scroll = zoom · klik opent de bron</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-[70vh] w-full touch-none select-none"
        onPointerMove={onMove}
        onPointerDown={onBgDown}
        onPointerUp={(e) => onUp(e)}
        onPointerLeave={() => {
          drag.current = null;
          pan.current = null;
        }}
        onWheel={onWheel}
      >
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.scale})`}>
          {edges.map((e, k) => {
            const i = idx.get(e.source);
            const j = idx.get(e.target);
            if (i === undefined || j === undefined || !p[i] || !p[j]) return null;
            const active = hover === null || hover === e.source || hover === e.target;
            return (
              <line
                key={k}
                x1={p[i]!.x}
                y1={p[i]!.y}
                x2={p[j]!.x}
                y2={p[j]!.y}
                stroke={active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.05)"}
                strokeWidth={0.6 + e.weight * 4}
              />
            );
          })}
          {nodes.map((n, i) => {
            if (!p[i]) return null;
            const r = 5 + Math.sqrt(n.size) * 2.2;
            const hot = hover === n.id || (hover !== null && neighbors.get(hover)?.has(n.id));
            const dim = hover !== null && !hot;
            const showLabel = hot || hover === null ? n.size >= 3 || hot : false;
            return (
              <g
                key={n.id}
                transform={`translate(${p[i]!.x} ${p[i]!.y})`}
                style={{ cursor: "pointer", opacity: dim ? 0.25 : 1 }}
                onPointerDown={onNodeDown(i)}
                onPointerUp={(e) => onUp(e, n)}
                onPointerEnter={() => setHover(n.id)}
                onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
              >
                <circle r={r} fill={colorOf(n.group)} stroke="#0b0e13" strokeWidth={1.5} />
                {showLabel && (
                  <text
                    x={r + 3}
                    y={3.5}
                    fontSize={hover === n.id ? 13 : 10.5}
                    fill={hover === n.id ? "#fff" : "rgba(255,255,255,0.7)"}
                    style={{ pointerEvents: "none", paintOrder: "stroke", stroke: "#0b0e13", strokeWidth: 3 }}
                  >
                    {n.label.length > 42 ? `${n.label.slice(0, 42)}…` : n.label}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
