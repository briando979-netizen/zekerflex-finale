"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent, WheelEvent as RWheelEvent } from "react";
import type { Begrip, GraafKnoop, GraafLijn, LijnSoort } from "@/lib/rag/graph-analyse";
import { themaKleur } from "@/components/admin/brein/kleuren";

// De Kennisgraaf als Obsidian-achtige force-directed grafiek, met eigen lichte
// physics (geen dependency): afstoting tussen knopen, veren langs lijnen, lichte
// zwaartekracht naar het midden, met cooling. Eromheen: zoeken (licht op), groepen
// en thema's aan/uit, kleur op soort of thema, grootte op passages, centraliteit
// of brugfunctie, labels, lijnsoorten en een ondergrens voor het gewicht, de
// focusstand (alleen de buurt van een knoop), het kortste pad tussen twee knopen,
// "vraag het brein" (het denkpad licht op), een detailpaneel per knoop (passages,
// buren, begrippen, thema, scores), een lijstweergave (toegankelijk), zoomen,
// passend maken, herstellen, volledig scherm en export. Slepen pint een knoop;
// wiel = zoom; slepen op de achtergrond = pan. De weergave-instellingen blijven
// per apparaat bewaard (localStorage, altijd in try/catch).

type GNode = GraafKnoop;
type GEdge = GraafLijn;

interface Detail {
  node: GNode;
  passages: { id: string; title: string; tekst: string; href?: string }[];
  buren: { id: string; label: string; group: string; weight: number; soort: GEdge["soort"] }[];
  begrippen: string[];
  publiek: string[];
  thema: { id: number; naam: string } | null;
  scores: { centraal: number; brug: number } | null;
}

interface Denkpad {
  vraag: string;
  confident: boolean;
  retrievers: string[];
  stappen: { id: string; label: string; group: string; score: number; via: string[]; passage: string }[];
}

interface Pad {
  van: string;
  naar: string;
  knopen: { id: string; label: string; group: string }[];
  lijnen: GEdge[];
}

interface Focus {
  id: string;
  diepte: number;
  knopen: Set<string>;
}

export interface ThemaKort {
  id: number;
  naam: string;
  grootte: number;
}

type KleurStand = "soort" | "thema";
type LabelStand = "auto" | "alles" | "geen";
type GrootteStand = "passages" | "centraal" | "brug";

interface Weergave {
  kleur: KleurStand;
  labels: LabelStand;
  grootte: GrootteStand;
  soorten: LijnSoort[];
  minGewicht: number;
}

const WEERGAVE_SLEUTEL = "zf:kennisgraaf:weergave";
const STANDAARD_WEERGAVE: Weergave = { kleur: "soort", labels: "auto", grootte: "passages", soorten: ["begrippen", "semantisch", "begrip"], minGewicht: 0 };

const GROUP_COLOR: Record<string, string> = {
  intern: "#7CC5FF",
  kennisbank: "#4FE0A0",
  blog: "#FFC46B",
  whitepaper: "#C9A5FF",
  faq: "#F5B9AE",
  "wet-dba": "#9EE6C9",
  help: "#73D2C0",
  howto: "#B6C2CC",
  begrip: "#F2E36B",
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
  begrip: "Begrippen",
  overig: "Overig",
};
const SOORT_LABEL: Record<GEdge["soort"], string> = { begrippen: "woordoverlap", semantisch: "semantisch (embeddings)", begrip: "begrip" };
const SOORT_KORT: Record<LijnSoort, string> = { begrippen: "woorden", semantisch: "semantisch", begrip: "begrippen" };
const colorOf = (g: string) => GROUP_COLOR[g] ?? "#8A938C";
const PUBLIEK_LABEL: Record<string, string> = { public: "openbaar", werknemer: "werknemers", opdrachtgever: "opdrachtgevers", admin: "alleen beheer" };

const W = 1000;
const H = 700;
const lijnSleutel = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface P {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const knopKlasse = "rounded-md border border-white/15 px-2 py-1 hover:bg-white/10 disabled:opacity-40";
const knopActief = "rounded-md border border-brand-mint/60 bg-brand-mint/15 px-2 py-1 text-white";

/** Een rij keuzeknoppen (één actief), als segmentknop. */
function Keuze<T extends string>({ label, waarde, opties, onKies }: { label: string; waarde: T; opties: { v: T; t: string }[]; onKies: (v: T) => void }) {
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <span className="text-white/35">{label}</span>
      {opties.map((o) => (
        <button key={o.v} type="button" aria-pressed={waarde === o.v} onClick={() => onKies(o.v)} className={waarde === o.v ? knopActief : knopKlasse}>
          {o.t}
        </button>
      ))}
    </span>
  );
}

export function KnowledgeGraph({
  nodes,
  edges,
  begrippen,
  centraal,
  bruggen,
  themas,
  maten,
}: {
  nodes: GNode[];
  edges: GEdge[];
  begrippen: Begrip[];
  centraal: string[];
  bruggen: string[];
  themas: ThemaKort[];
  maten: Record<string, { c: number; b: number }>;
}) {
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
  const centraalSet = useMemo(() => new Set(centraal), [centraal]);
  const brugSet = useMemo(() => new Set(bruggen), [bruggen]);
  const groups = useMemo(() => [...new Set(nodes.map((n) => n.group))], [nodes]);
  const themaNaam = useMemo(() => new Map(themas.map((t) => [t.id, t.naam])), [themas]);

  // --- weergave (per apparaat bewaard)
  const [weergave, setWeergave] = useState<Weergave>(STANDAARD_WEERGAVE);
  const [weergaveGeladen, setWeergaveGeladen] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(WEERGAVE_SLEUTEL);
      if (raw) {
        const w = JSON.parse(raw) as Partial<Weergave>;
        setWeergave({
          kleur: w.kleur === "thema" ? "thema" : "soort",
          labels: w.labels === "alles" || w.labels === "geen" ? w.labels : "auto",
          grootte: w.grootte === "centraal" || w.grootte === "brug" ? w.grootte : "passages",
          soorten: Array.isArray(w.soorten) ? (w.soorten.filter((s): s is LijnSoort => s === "begrippen" || s === "semantisch" || s === "begrip")) : STANDAARD_WEERGAVE.soorten,
          minGewicht: typeof w.minGewicht === "number" && w.minGewicht >= 0 && w.minGewicht <= 0.6 ? w.minGewicht : 0,
        });
      }
    } catch {
      /* geen opslag (privévenster): de standaard */
    }
    setWeergaveGeladen(true);
  }, []);
  useEffect(() => {
    if (!weergaveGeladen) return;
    try {
      window.localStorage.setItem(WEERGAVE_SLEUTEL, JSON.stringify(weergave));
    } catch {
      /* geen opslag: dan onthouden we niets */
    }
  }, [weergave, weergaveGeladen]);
  const zetWeergave = (deel: Partial<Weergave>) => setWeergave((w) => ({ ...w, ...deel }));

  // --- filters en selectie
  const [uit, setUit] = useState<Set<string>>(() => new Set());
  const [uitThemas, setUitThemas] = useState<Set<number>>(() => new Set());
  const [zoek, setZoek] = useState("");
  const [vraag, setVraag] = useState("");
  const [pad, setPad] = useState<Denkpad | null>(null);
  const [padBezig, setPadBezig] = useState(false);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailBezig, setDetailBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const [routeVan, setRouteVan] = useState<string | null>(null);
  const [route, setRoute] = useState<Pad | null>(null);
  const [lijst, setLijst] = useState(false);
  const [volledig, setVolledig] = useState(false);

  const zichtbaar = useCallback(
    (n: GNode) => !uit.has(n.group) && (n.thema === undefined || !uitThemas.has(n.thema)) && (!focus || focus.knopen.has(n.id)),
    [uit, uitThemas, focus],
  );
  const soortenSet = useMemo(() => new Set(weergave.soorten), [weergave.soorten]);
  const lijnZichtbaar = useCallback((e: GEdge) => soortenSet.has(e.soort) && e.weight >= weergave.minGewicht, [soortenSet, weergave.minGewicht]);
  const zoekLager = zoek.trim().toLowerCase();
  const matcht = useCallback((n: GNode) => zoekLager.length > 0 && n.label.toLowerCase().includes(zoekLager), [zoekLager]);
  const padIds = useMemo(() => new Set(pad?.stappen.map((s) => s.id) ?? []), [pad]);
  const routeIds = useMemo(() => new Set(route?.knopen.map((k) => k.id) ?? []), [route]);
  const routeLijnen = useMemo(() => new Set(route?.lijnen.map((l) => lijnSleutel(l.source, l.target)) ?? []), [route]);

  const kleurVan = useCallback((n: GNode) => (weergave.kleur === "thema" ? themaKleur(n.thema) : colorOf(n.group)), [weergave.kleur]);
  const straal = useCallback(
    (n: GNode) => {
      if (n.group === "begrip") return 4 + Math.sqrt(n.size) * 1.6;
      if (weergave.grootte === "centraal") return 4 + (maten[n.id]?.c ?? 0) * 26;
      if (weergave.grootte === "brug") return 4 + (maten[n.id]?.b ?? 0) * 26;
      return 5 + Math.sqrt(n.size) * 2.2;
    },
    [weergave.grootte, maten],
  );

  // --- physics
  const pos = useRef<P[]>([]);
  const alpha = useRef(1);
  const raf = useRef<number | null>(null);
  const drag = useRef<{ i: number; moved: boolean } | null>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [, force] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  // wat de physics mag zien: dezelfde zichtbaarheid als het tekenen, maar via een ref (de animatie loopt buiten React)
  const zichtRef = useRef<boolean[]>([]);
  zichtRef.current = nodes.map(zichtbaar);
  const lijnRef = useRef<boolean[]>([]);
  lijnRef.current = edges.map(lijnZichtbaar);

  // beginposities in een ring, deterministisch (gelijk op server en in de browser)
  if (pos.current.length !== nodes.length) {
    pos.current = nodes.map((n, i) => {
      const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      const r = (n.group === "begrip" ? 80 : 180) + ((i * 53) % 120);
      return { x: Math.round((W / 2 + Math.cos(a) * r) * 100) / 100, y: Math.round((H / 2 + Math.sin(a) * r) * 100) / 100, vx: 0, vy: 0 };
    });
  }

  const tick = useCallback(() => {
    const p = pos.current;
    const n = p.length;
    const a = alpha.current;
    const weg = (i: number) => zichtRef.current[i] === false;
    for (let i = 0; i < n; i++) {
      if (weg(i)) continue;
      for (let j = i + 1; j < n; j++) {
        if (weg(j)) continue;
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
    edges.forEach((e, k) => {
      if (lijnRef.current[k] === false) return;
      const i = idx.get(e.source);
      const j = idx.get(e.target);
      if (i === undefined || j === undefined || weg(i) || weg(j)) return;
      const dx = p[j]!.x - p[i]!.x;
      const dy = p[j]!.y - p[i]!.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      // begrippen hangen dichter bij hun documenten
      const rest = e.soort === "begrip" ? 60 : 90;
      const f = 0.02 * a * (d - rest);
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      p[i]!.vx += fx;
      p[i]!.vy += fy;
      p[j]!.vx -= fx;
      p[j]!.vy -= fy;
    });
    const dragI = drag.current?.i ?? -1;
    for (let i = 0; i < n; i++) {
      if (i === dragI || weg(i)) continue;
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

  // volledig scherm bijhouden (ook als iemand met Esc eruit gaat)
  useEffect(() => {
    const onChange = () => setVolledig(document.fullscreenElement === wrapRef.current && wrapRef.current !== null);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // --- muis en toetsen
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
      // het sleepbegin nu vastpakken: React draait de update later, en loslaten (onUp) kan pan.current
      // intussen op null zetten (iPhone: "null is not an object (evaluating 'J.current.tx')")
      const start = pan.current;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      setView((v) => ({ ...v, tx: start.tx + dx, ty: start.ty + dy }));
    }
  };
  const onUp = (_e: RPointerEvent, node?: GNode) => {
    if (drag.current && node && !drag.current.moved) void klikKnoop(node.id);
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
  const zoom = (factor: number) => setView((v) => ({ ...v, scale: Math.max(0.3, Math.min(3, v.scale * factor)) }));

  const passend = () => {
    const p = pos.current;
    const zicht = nodes.map((n, i) => (zichtbaar(n) ? p[i] : null)).filter((x): x is P => x !== null);
    if (zicht.length === 0) return;
    const minX = Math.min(...zicht.map((q) => q.x)) - 40;
    const maxX = Math.max(...zicht.map((q) => q.x)) + 160;
    const minY = Math.min(...zicht.map((q) => q.y)) - 40;
    const maxY = Math.max(...zicht.map((q) => q.y)) + 40;
    const scale = Math.max(0.3, Math.min(3, Math.min(W / (maxX - minX), H / (maxY - minY))));
    setView({ scale, tx: (W - (minX + maxX) * scale) / 2, ty: (H - (minY + maxY) * scale) / 2 });
  };
  const herstel = () => {
    pos.current = [];
    setView({ scale: 1, tx: 0, ty: 0 });
    setUit(new Set());
    setUitThemas(new Set());
    setZoek("");
    setPad(null);
    setGekozen(null);
    setDetail(null);
    setFocus(null);
    setRoute(null);
    setRouteVan(null);
    setMelding(null);
    setWeergave(STANDAARD_WEERGAVE);
    force((v) => v + 1);
    kick(1);
  };
  const volledigScherm = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrapRef.current?.requestFullscreen?.();
    } catch {
      setMelding("Volledig scherm is in deze browser niet beschikbaar.");
    }
  };

  const kies = useCallback(async (id: string | null) => {
    setGekozen(id);
    setDetail(null);
    if (!id) return;
    setDetailBezig(true);
    const r = await fetch(`/api/admin/kennisgraaf?knoop=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
    setDetailBezig(false);
    if (r?.ok) setDetail((await r.json()) as Detail);
    else setMelding("Details van deze knoop zijn niet te laden.");
  }, []);

  /** Een klik op een knoop: het eindpunt van een pad als er een begin staat, anders de details. */
  const klikKnoop = useCallback(
    async (id: string) => {
      if (routeVan && routeVan !== id) {
        setMelding(null);
        const r = await fetch(`/api/admin/kennisgraaf?van=${encodeURIComponent(routeVan)}&naar=${encodeURIComponent(id)}`, { cache: "no-store" }).catch(() => null);
        setRouteVan(null);
        if (r?.ok) {
          const p = (await r.json()) as Pad;
          setRoute(p);
          if (p.knopen.length === 0) setMelding("Er is geen pad tussen deze twee knopen: ze liggen in losse delen van het netwerk.");
        } else setMelding("Het pad kon niet worden berekend.");
        return;
      }
      await kies(id);
    },
    [routeVan, kies],
  );

  const vraagHetBrein = async () => {
    const v = vraag.trim();
    if (!v) {
      setPad(null);
      return;
    }
    setPadBezig(true);
    setMelding(null);
    const r = await fetch(`/api/admin/kennisgraaf?vraag=${encodeURIComponent(v)}`, { cache: "no-store" }).catch(() => null);
    setPadBezig(false);
    if (r?.ok) {
      const d = (await r.json()) as Denkpad;
      setPad(d);
      if (d.stappen.length === 0) setMelding("Het brein vond geen passend document voor deze vraag.");
    } else setMelding("De vraag kon niet aan het brein worden gesteld.");
  };

  const focusOp = async (id: string, diepte: 1 | 2) => {
    setMelding(null);
    const r = await fetch(`/api/admin/kennisgraaf?buurt=${encodeURIComponent(id)}&diepte=${diepte}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) {
      setMelding("De buurt kon niet worden geladen.");
      return;
    }
    const b = (await r.json()) as { id: string; diepte: number; knopen: string[] };
    setFocus({ id, diepte: b.diepte, knopen: new Set(b.knopen) });
    kick(0.8);
  };
  const focusUit = () => {
    setFocus(null);
    kick(0.6);
  };

  // zoeken: Enter kiest de eerste treffer
  const zoekTreffers = useMemo(() => (zoekLager ? nodes.filter((n) => n.label.toLowerCase().includes(zoekLager)) : []), [nodes, zoekLager]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGekozen(null);
        setDetail(null);
        setRouteVan(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const p = pos.current;
  const actiefId = hover ?? gekozen;
  const nadruk = zoekLager.length > 0 || padIds.size > 0 || routeIds.size > 0;
  const zichtbaarAantal = nodes.filter(zichtbaar).length;
  const lijnenZichtbaar = edges.filter((e, k) => {
    if (!lijnZichtbaar(e)) return false;
    const i = idx.get(e.source);
    const j = idx.get(e.target);
    return i !== undefined && j !== undefined && zichtRef.current[i] !== false && zichtRef.current[j] !== false && k >= 0;
  }).length;
  const gekozenNode = gekozen ? nodes.find((n) => n.id === gekozen) : undefined;
  const themasInBeeld = themas.filter((t) => nodes.some((n) => n.thema === t.id));

  return (
    <div ref={wrapRef} className={`overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e13] text-white ${volledig ? "flex h-screen flex-col rounded-none" : ""}`}>
      {/* werkbalk */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-[11px] text-white/60">
        <span className="font-semibold text-white/85">
          {zichtbaarAantal} knopen · {lijnenZichtbaar} verbanden · {begrippen.length} begrippen
          {focus ? ` · focus op ${nodes.find((n) => n.id === focus.id)?.label ?? focus.id} (${focus.diepte} ${focus.diepte === 1 ? "stap" : "stappen"})` : ""}
        </span>
        <form
          className="ml-2 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const eerste = zoekTreffers[0];
            if (eerste) void kies(eerste.id);
          }}
        >
          <label className="sr-only" htmlFor="kg-zoek">
            Zoek een knoop
          </label>
          <input
            id="kg-zoek"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek een document of begrip…"
            className="w-48 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white placeholder:text-white/35 focus:border-brand-mint focus:outline-none"
          />
          {zoekLager && <span className="text-white/35">{zoekTreffers.length} {zoekTreffers.length === 1 ? "treffer" : "treffers"}{zoekTreffers.length > 0 ? " · Enter opent de eerste" : ""}</span>}
        </form>
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void vraagHetBrein();
          }}
        >
          <label className="sr-only" htmlFor="kg-vraag">
            Vraag het brein
          </label>
          <input
            id="kg-vraag"
            value={vraag}
            onChange={(e) => setVraag(e.target.value)}
            placeholder="Vraag het brein: welke knopen pakt het?"
            className="w-64 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white placeholder:text-white/35 focus:border-brand-mint focus:outline-none"
          />
          <button type="submit" disabled={padBezig} className="rounded-md bg-brand-mint px-2.5 py-1 text-[11px] font-semibold text-ink disabled:opacity-50">
            {padBezig ? "Denkt…" : "Denkpad"}
          </button>
          {pad && (
            <button type="button" onClick={() => setPad(null)} className="text-white/45 underline hover:text-white/80">
              wis
            </button>
          )}
        </form>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => zoom(1.25)} aria-label="Inzoomen" className={knopKlasse}>
            +
          </button>
          <button type="button" onClick={() => zoom(1 / 1.25)} aria-label="Uitzoomen" className={knopKlasse}>
            −
          </button>
          <button type="button" onClick={passend} className={knopKlasse}>
            Passend maken
          </button>
          <button type="button" onClick={herstel} className={knopKlasse}>
            Herstellen
          </button>
          <button type="button" onClick={() => setLijst((v) => !v)} aria-pressed={lijst} className={lijst ? knopActief : knopKlasse}>
            Lijst
          </button>
          <button type="button" onClick={() => void volledigScherm()} aria-pressed={volledig} className={volledig ? knopActief : knopKlasse}>
            {volledig ? "Scherm sluiten" : "Volledig scherm"}
          </button>
          <details className="relative">
            <summary className={`${knopKlasse} cursor-pointer list-none`}>Exporteren</summary>
            <div className="absolute right-0 z-20 mt-1 flex w-56 flex-col rounded-md border border-white/15 bg-[#0e1116] p-1 shadow-xl">
              {(
                [
                  ["json", "JSON (knopen, lijnen, thema's)"],
                  ["graphml", "GraphML (Gephi, yEd)"],
                  ["dot", "DOT (Graphviz)"],
                  ["csv-knopen", "CSV: knopen (Excel)"],
                  ["csv-lijnen", "CSV: lijnen (Excel)"],
                  ["rapport", "Rapport in gewone taal (Markdown)"],
                ] as const
              ).map(([k, t]) => (
                <Link key={k} href={`/api/admin/kennisgraaf?export=${k}`} prefetch={false} className="rounded px-2 py-1 text-left text-white/80 hover:bg-white/10">
                  {t}
                </Link>
              ))}
            </div>
          </details>
        </span>
      </div>
      {/* weergave */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-white/10 px-3 py-1.5 text-[11px] text-white/60">
        <Keuze label="Kleur" waarde={weergave.kleur} opties={[{ v: "soort", t: "soort" }, { v: "thema", t: "thema" }]} onKies={(v) => zetWeergave({ kleur: v })} />
        <Keuze label="Grootte" waarde={weergave.grootte} opties={[{ v: "passages", t: "passages" }, { v: "centraal", t: "centraal" }, { v: "brug", t: "brug" }]} onKies={(v) => zetWeergave({ grootte: v })} />
        <Keuze label="Labels" waarde={weergave.labels} opties={[{ v: "auto", t: "auto" }, { v: "alles", t: "alles" }, { v: "geen", t: "geen" }]} onKies={(v) => zetWeergave({ labels: v })} />
        <span className="inline-flex items-center gap-1" role="group" aria-label="Lijnsoorten">
          <span className="text-white/35">Lijnen</span>
          {(["begrippen", "semantisch", "begrip"] as const).map((s) => {
            const aan = soortenSet.has(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={aan}
                onClick={() => {
                  zetWeergave({ soorten: aan ? weergave.soorten.filter((x) => x !== s) : [...weergave.soorten, s] });
                  kick(0.5);
                }}
                className={aan ? knopActief : knopKlasse}
              >
                {SOORT_KORT[s]}
              </button>
            );
          })}
        </span>
        <label className="inline-flex items-center gap-1.5">
          <span className="text-white/35">Minimaal gewicht</span>
          <input
            type="range"
            min={0}
            max={0.6}
            step={0.05}
            value={weergave.minGewicht}
            onChange={(e) => {
              zetWeergave({ minGewicht: Number(e.target.value) });
              kick(0.4);
            }}
            className="w-24 accent-[#4FE0A0]"
          />
          <span className="w-8 tabular-nums text-white/70">{weergave.minGewicht.toFixed(2)}</span>
        </label>
        {focus && (
          <button type="button" onClick={focusUit} className={knopActief}>
            Focus uit
          </button>
        )}
        {routeVan && <span className="text-[#FFC46B]">Pad vanaf {nodes.find((n) => n.id === routeVan)?.label ?? routeVan}: klik op de bestemming (Esc = stop)</span>}
        {route && !routeVan && (
          <button type="button" onClick={() => setRoute(null)} className={knopActief}>
            Pad wissen
          </button>
        )}
      </div>
      {/* legenda = filters */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 px-3 py-1.5 text-[11px] text-white/55">
        {weergave.kleur === "soort"
          ? groups.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={!uit.has(g)}
                onClick={() => {
                  setUit((s) => {
                    const n = new Set(s);
                    if (n.has(g)) n.delete(g);
                    else n.add(g);
                    return n;
                  });
                  kick(0.5);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${uit.has(g) ? "border-white/10 opacity-40" : "border-white/20"}`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: colorOf(g) }} />
                {GROUP_LABEL[g] ?? g}
                <span className="text-white/35">{nodes.filter((n) => n.group === g).length}</span>
              </button>
            ))
          : themasInBeeld.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={!uitThemas.has(t.id)}
                title={t.naam}
                onClick={() => {
                  setUitThemas((s) => {
                    const n = new Set(s);
                    if (n.has(t.id)) n.delete(t.id);
                    else n.add(t.id);
                    return n;
                  });
                  kick(0.5);
                }}
                className={`inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border px-2 py-0.5 ${uitThemas.has(t.id) ? "border-white/10 opacity-40" : "border-white/20"}`}
              >
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: themaKleur(t.id) }} />
                <span className="truncate">
                  {t.id}. {t.naam}
                </span>
                <span className="text-white/35">{t.grootte}</span>
              </button>
            ))}
        <span className="ml-auto text-white/30">sleep een knoop · scroll = zoom · klik = details · ring = meest centraal · ruitring = brug</span>
      </div>
      {melding && (
        <p role="status" className="border-b border-white/10 px-3 py-1.5 text-[11px] text-[#FFC46B]">
          {melding}
        </p>
      )}

      <div className={`relative ${volledig ? "min-h-0 flex-1" : ""}`}>
        {lijst ? (
          <div className={`overflow-auto ${volledig ? "h-full" : "h-[70vh]"}`}>
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Alle zichtbare knopen van de kennisgraaf</caption>
              <thead className="sticky top-0 bg-[#0b0e13] text-[10px] uppercase tracking-[0.12em] text-white/40">
                <tr>
                  <th scope="col" className="px-3 py-2">
                    Knoop
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Soort
                  </th>
                  <th scope="col" className="px-3 py-2">
                    Thema
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Passages
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Verbanden
                  </th>
                </tr>
              </thead>
              <tbody>
                {nodes
                  .filter(zichtbaar)
                  .filter((n) => !zoekLager || matcht(n))
                  .map((n) => (
                    <tr key={n.id} className={`border-t border-white/5 hover:bg-white/5 ${gekozen === n.id ? "bg-white/10" : ""}`}>
                      <td className="px-3 py-1.5">
                        <button type="button" onClick={() => void kies(n.id)} className="flex items-center gap-2 text-left text-white/85 hover:underline">
                          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: kleurVan(n) }} />
                          {n.label}
                        </button>
                      </td>
                      <td className="px-3 py-1.5 text-white/55">{GROUP_LABEL[n.group] ?? n.group}</td>
                      <td className="px-3 py-1.5 text-white/55">{n.thema !== undefined ? `${n.thema}. ${themaNaam.get(n.thema) ?? ""}` : "–"}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-white/55">{n.group === "begrip" ? "–" : n.size}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-white/55">{neighbors.get(n.id)?.size ?? 0}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className={`w-full touch-none select-none ${volledig ? "h-full" : "h-[70vh]"}`}
            role="img"
            aria-label="Kennisgraaf: documenten en begrippen als netwerk"
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
                if (!lijnZichtbaar(e)) return null;
                const i = idx.get(e.source);
                const j = idx.get(e.target);
                if (i === undefined || j === undefined || !p[i] || !p[j]) return null;
                if (!zichtbaar(nodes[i]!) || !zichtbaar(nodes[j]!)) return null;
                const opPad = padIds.has(e.source) && padIds.has(e.target);
                const opRoute = routeLijnen.has(lijnSleutel(e.source, e.target));
                const active = actiefId === null ? true : actiefId === e.source || actiefId === e.target;
                const kleur = opRoute
                  ? "rgba(255,196,107,0.95)"
                  : opPad
                    ? "rgba(79,224,160,0.7)"
                    : e.soort === "semantisch"
                      ? "rgba(201,165,255,0.35)"
                      : e.soort === "begrip"
                        ? "rgba(242,227,107,0.18)"
                        : "rgba(255,255,255,0.22)";
                return (
                  <line
                    key={k}
                    x1={p[i]!.x}
                    y1={p[i]!.y}
                    x2={p[j]!.x}
                    y2={p[j]!.y}
                    stroke={active || opRoute ? kleur : "rgba(255,255,255,0.05)"}
                    strokeWidth={(e.soort === "begrip" ? 0.5 : 0.6) + e.weight * 4 + (opRoute ? 1.5 : 0)}
                    strokeDasharray={e.soort === "begrip" ? "3 3" : undefined}
                  />
                );
              })}
              {nodes.map((n, i) => {
                if (!p[i] || !zichtbaar(n)) return null;
                const r = straal(n);
                const buur = actiefId !== null && neighbors.get(actiefId)?.has(n.id);
                const hot = actiefId === n.id || Boolean(buur) || matcht(n) || padIds.has(n.id) || routeIds.has(n.id) || routeVan === n.id;
                const dim = (actiefId !== null || nadruk) && !hot;
                const showLabel = weergave.labels === "alles" || (weergave.labels === "auto" && (hot || (actiefId === null && !nadruk && (n.size >= 3 || n.group === "begrip" || Boolean(focus)))));
                const kleur = kleurVan(n);
                return (
                  <g
                    key={n.id}
                    transform={`translate(${p[i]!.x} ${p[i]!.y})`}
                    style={{ cursor: "pointer", opacity: dim ? 0.2 : 1 }}
                    onPointerDown={onNodeDown(i)}
                    onPointerUp={(e) => onUp(e, n)}
                    onPointerEnter={() => setHover(n.id)}
                    onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                  >
                    {centraalSet.has(n.id) && <circle r={r + 4} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth={1.2} />}
                    {brugSet.has(n.id) && <rect x={-(r + 6)} y={-(r + 6)} width={(r + 6) * 2} height={(r + 6) * 2} rx={2} transform="rotate(45)" fill="none" stroke="rgba(255,196,107,0.55)" strokeWidth={1} />}
                    {padIds.has(n.id) && <circle r={r + 7} fill="none" stroke="rgba(79,224,160,0.8)" strokeWidth={1.5} />}
                    {(routeIds.has(n.id) || routeVan === n.id) && <circle r={r + 8} fill="none" stroke="rgba(255,196,107,0.95)" strokeWidth={1.8} />}
                    {n.group === "begrip" ? (
                      <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={2} transform="rotate(45)" fill={kleur} stroke="#0b0e13" strokeWidth={1.5} />
                    ) : (
                      <circle r={r} fill={kleur} stroke={gekozen === n.id ? "#fff" : "#0b0e13"} strokeWidth={1.5} />
                    )}
                    {showLabel && (
                      <text
                        x={r + 3}
                        y={3.5}
                        fontSize={actiefId === n.id ? 13 : n.group === "begrip" ? 9.5 : 10.5}
                        fill={actiefId === n.id ? "#fff" : n.group === "begrip" ? "rgba(242,227,107,0.85)" : "rgba(255,255,255,0.7)"}
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
        )}

        {/* detailpaneel */}
        {gekozen && (
          <aside className="absolute right-3 top-3 flex max-h-[calc(70vh-1.5rem)] w-80 flex-col overflow-hidden rounded-xl border border-white/15 bg-[#0e1116]/95 text-xs shadow-xl backdrop-blur" aria-live="polite">
            <div className="flex items-start gap-2 border-b border-white/10 px-3 py-2">
              <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: gekozenNode ? kleurVan(gekozenNode) : "#8A938C" }} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white/90">{detail?.node.label ?? gekozenNode?.label ?? gekozen}</p>
                <p className="text-[10px] text-white/40">
                  {GROUP_LABEL[detail?.node.group ?? gekozenNode?.group ?? ""] ?? ""}
                  {detail?.thema ? ` · thema ${detail.thema.id}: ${detail.thema.naam}` : ""}
                  {detail && detail.publiek.length > 0 ? ` · ${detail.publiek.map((a) => PUBLIEK_LABEL[a] ?? a).join(", ")}` : ""}
                </p>
              </div>
              <button type="button" onClick={() => void kies(null)} aria-label="Sluiten" className="text-white/45 hover:text-white">
                ✕
              </button>
            </div>
            <div className="flex flex-wrap gap-1 border-b border-white/10 px-3 py-1.5 text-[10px]">
              <button type="button" onClick={() => void focusOp(gekozen, 1)} className={focus?.id === gekozen && focus.diepte === 1 ? knopActief : knopKlasse}>
                Focus: buren
              </button>
              <button type="button" onClick={() => void focusOp(gekozen, 2)} className={focus?.id === gekozen && focus.diepte === 2 ? knopActief : knopKlasse}>
                Focus: 2 stappen
              </button>
              <button
                type="button"
                onClick={() => {
                  setRouteVan(gekozen);
                  setRoute(null);
                  setGekozen(null);
                  setDetail(null);
                  setMelding("Klik nu op de knoop waar het pad naartoe moet.");
                }}
                className={knopKlasse}
              >
                Pad vanaf hier
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {detailBezig && <p className="text-white/40">Laden…</p>}
              {detail && (
                <>
                  {detail.node.href && (
                    <a href={detail.node.href} target="_blank" rel="noopener noreferrer" className="mb-2 inline-block text-brand-mint underline">
                      Open de bron ↗
                    </a>
                  )}
                  {detail.scores && (
                    <p className="mb-2 text-[10px] text-white/45">
                      centraliteit {detail.scores.centraal} · brugfunctie {detail.scores.brug} (× 1000) · {detail.buren.length} {detail.buren.length === 1 ? "verband" : "verbanden"}
                    </p>
                  )}
                  {detail.begrippen.length > 0 && (
                    <p className="mb-2 flex flex-wrap gap-1">
                      {detail.begrippen.map((b) => (
                        <span key={b} className="rounded-full bg-[rgba(242,227,107,0.14)] px-1.5 py-0.5 text-[10px] text-[#F2E36B]">
                          {b}
                        </span>
                      ))}
                    </p>
                  )}
                  <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-white/35">{detail.node.group === "begrip" ? "Documenten" : "Passages"}</p>
                  <ul className="space-y-2">
                    {detail.passages.map((ps) => (
                      <li key={ps.id} className="rounded-md bg-white/[0.04] px-2 py-1.5">
                        {detail.node.group === "begrip" ? (
                          <button type="button" onClick={() => void kies(ps.id)} className="text-left font-medium text-white/85 hover:underline">
                            {ps.title}
                          </button>
                        ) : (
                          <p className="font-medium text-white/85">{ps.title}</p>
                        )}
                        <p className="mt-0.5 text-[11px] leading-snug text-white/55">{ps.tekst}</p>
                      </li>
                    ))}
                  </ul>
                  {detail.buren.length > 0 && (
                    <>
                      <p className="mb-1 mt-3 text-[10px] uppercase tracking-[0.14em] text-white/35">Verbonden met</p>
                      <ul className="space-y-1">
                        {detail.buren.map((b) => (
                          <li key={b.id}>
                            <button type="button" onClick={() => void kies(b.id)} className="flex w-full items-center gap-2 text-left hover:underline">
                              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: colorOf(b.group) }} />
                              <span className="min-w-0 flex-1 truncate text-white/80">{b.label}</span>
                              <span className="flex-shrink-0 text-[10px] text-white/35">
                                {SOORT_LABEL[b.soort]} · {b.weight}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
          </aside>
        )}

        {/* kortste pad */}
        {route && !gekozen && route.knopen.length > 0 && (
          <aside className="absolute left-3 top-3 max-h-[calc(70vh-1.5rem)] w-80 overflow-y-auto rounded-xl border border-[#FFC46B]/40 bg-[#0e1116]/95 p-3 text-xs shadow-xl backdrop-blur" aria-live="polite">
            <p className="font-semibold text-white/90">
              Kortste pad: {route.knopen.length - 1} {route.knopen.length - 1 === 1 ? "stap" : "stappen"}
            </p>
            <p className="mt-0.5 text-[10px] text-white/40">een sterke lijn is een korte stap; via begrippen mag ook</p>
            <ol className="mt-2 space-y-1.5">
              {route.knopen.map((k, i) => (
                <li key={k.id}>
                  <button type="button" onClick={() => void kies(k.id)} className="flex w-full items-start gap-2 text-left hover:underline">
                    <span className="w-4 flex-shrink-0 text-white/35">{i + 1}.</span>
                    <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: colorOf(k.group) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-white/85">{k.label}</span>
                      {i > 0 && route.lijnen[i - 1] && (
                        <span className="block truncate text-[10px] text-white/40">
                          via {SOORT_LABEL[route.lijnen[i - 1]!.soort]} · {route.lijnen[i - 1]!.weight}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        )}

        {/* denkpad */}
        {pad && !gekozen && !route && (
          <aside className="absolute left-3 top-3 max-h-[calc(70vh-1.5rem)] w-80 overflow-y-auto rounded-xl border border-brand-mint/30 bg-[#0e1116]/95 p-3 text-xs shadow-xl backdrop-blur" aria-live="polite">
            <p className="font-semibold text-white/90">Denkpad voor: “{pad.vraag}”</p>
            <p className="mt-0.5 text-[10px] text-white/40">
              zoekers: {pad.retrievers.join(", ")} · {pad.confident ? "het brein is zeker van het antwoord" : "het brein laat het taalmodel beoordelen"}
            </p>
            <ol className="mt-2 space-y-1.5">
              {pad.stappen.map((s, i) => (
                <li key={s.id}>
                  <button type="button" onClick={() => void kies(s.id)} className="flex w-full items-start gap-2 text-left hover:underline">
                    <span className="w-4 flex-shrink-0 text-white/35">{i + 1}.</span>
                    <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: colorOf(s.group) }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-white/85">{s.label}</span>
                      <span className="block truncate text-[10px] text-white/40">
                        {s.passage} · via {s.via.join("+")} · {s.score}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>
    </div>
  );
}
