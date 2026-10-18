"use client";

import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Live kantoor — a floor plan of ZekerFlex where AI robots work. Every
// courier walk is a REAL event from the audit trail (an order, approved
// hours, a bank top-up, a sales mail …): a robot leaves the lobby, walks to
// the department that handled it and says what happened. Day and night
// follow the real clock in Amsterdam.
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

const ROOMS: { id: string; name: string; emoji: string; robot: string; x: number; y: number; tone: string }[] = [
  { id: "hq", name: "Hoofdkantoor · Jarvis", emoji: "🏢", robot: "🤖", x: 0, y: 0, tone: "#e0e7ff" },
  { id: "sales", name: "Sales & werving", emoji: "💼", robot: "🦾", x: 1, y: 0, tone: "#ede9fe" },
  { id: "operations", name: "Planning & uren", emoji: "🗓️", robot: "🤖", x: 2, y: 0, tone: "#dcfce7" },
  { id: "finance", name: "Facturatie", emoji: "🧾", robot: "🤖", x: 0, y: 1, tone: "#d1fae5" },
  { id: "lobby", name: "Lobby", emoji: "🚪", robot: "", x: 1, y: 1, tone: "#f8fafc" },
  { id: "bank", name: "ZekerFlex Bank", emoji: "🏦", robot: "🤖", x: 2, y: 1, tone: "#ccfbf1" },
  { id: "shop", name: "Webshop & magazijn", emoji: "📦", robot: "🦿", x: 0, y: 2, tone: "#fef3c7" },
  { id: "support", name: "Klantenservice & mail", emoji: "🎧", robot: "🤖", x: 1, y: 2, tone: "#e0f2fe" },
  { id: "legal", name: "Juridisch & compliance", emoji: "⚖️", robot: "🤖", x: 2, y: 2, tone: "#fce7f3" },
];
const ROOM = new Map(ROOMS.map((r) => [r.id, r]));
const centre = (id: string) => {
  const r = ROOM.get(id) ?? ROOM.get("hq")!;
  return { left: `${r.x * 33.33 + 16.66}%`, top: `${r.y * 33.33 + 20}%` };
};

interface Courier {
  key: string;
  ev: Ev;
  stage: "start" | "walking" | "arrived";
}

function amsterdamHour(now: Date) {
  return Number(new Intl.DateTimeFormat("nl-NL", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Amsterdam" }).format(now));
}

export function OfficeSim() {
  const [events, setEvents] = useState<Ev[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [now, setNow] = useState(() => new Date());
  const seen = useRef<Set<string>>(new Set());
  const queue = useRef<Ev[]>([]);

  // Poll the real activity feed.
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
      // First load: replay the latest few so the floor isn't empty.
      queue.current.push(...(first ? fresh.slice(0, 6) : fresh).reverse());
      first = false;
    };
    void load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, []);

  // Dispatch one courier every ~2.5s from the queue.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(new Date());
      const ev = queue.current.shift();
      if (!ev) return;
      const key = `${ev.id}-${Date.now()}`;
      setCouriers((c) => [...c.slice(-5), { key, ev, stage: "start" }]);
      setTimeout(() => setCouriers((c) => c.map((x) => (x.key === key ? { ...x, stage: "walking" } : x))), 60);
      setTimeout(() => setCouriers((c) => c.map((x) => (x.key === key ? { ...x, stage: "arrived" } : x))), 2600);
      setTimeout(() => setCouriers((c) => c.filter((x) => x.key !== key)), 9000);
    }, 2500);
    return () => clearInterval(t);
  }, []);

  const hour = amsterdamHour(now);
  const night = hour < 7 || hour >= 20;
  const busiest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes zf-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
        @keyframes zf-type { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
        .zf-bob { animation: zf-bob 1.6s ease-in-out infinite; }
        .zf-type { animation: zf-type .9s ease-in-out infinite; }
      `}</style>

      <div className="flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--a-dim)" }}>
        <span className="rounded-full px-3 py-1 font-mono" style={{ background: "var(--a-panel-2)", color: "var(--a-text)" }}>
          {night ? "🌙" : "☀️"} {now.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" })}
        </span>
        <span>{events.length} echte gebeurtenissen in de laatste 24 uur</span>
        {busiest && <span>· drukst: {ROOM.get(busiest[0])?.name ?? busiest[0]} ({busiest[1]})</span>}
      </div>

      <div
        className="relative w-full overflow-hidden rounded-3xl border transition-colors duration-1000"
        style={{ aspectRatio: "4 / 3", minHeight: 420, borderColor: "var(--a-border)", background: night ? "#0f172a" : "#f1f5f9" }}
      >
        {/* rooms */}
        {ROOMS.map((r) => {
          const n = counts[r.id] ?? 0;
          const busy = couriers.some((c) => c.ev.room === r.id && c.stage === "arrived");
          return (
            <div
              key={r.id}
              className="absolute rounded-2xl border p-2 transition-all duration-700"
              style={{
                left: `${r.x * 33.33 + 1}%`,
                top: `${r.y * 33.33 + 1}%`,
                width: "31.33%",
                height: "31.33%",
                background: night ? (r.id === "lobby" ? "#1e293b" : "#1e293bcc") : r.tone,
                borderColor: busy ? "#10b981" : night ? "#334155" : "#e2e8f0",
                boxShadow: busy ? "0 0 0 3px rgba(16,185,129,.35)" : "none",
              }}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="text-[11px] font-semibold leading-tight sm:text-xs" style={{ color: night ? "#e2e8f0" : "#0f172a" }}>
                  {r.emoji} {r.name}
                </span>
                {n > 0 && <span className="rounded-full bg-black/10 px-1.5 text-[10px] font-bold" style={{ color: night ? "#e2e8f0" : "#0f172a" }}>{n}</span>}
              </div>
              {r.id !== "lobby" && (
                <>
                  {/* desks */}
                  <div className="absolute bottom-2 left-2 right-2 flex justify-around">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="h-2.5 w-[22%] rounded-sm" style={{ background: night ? "#475569" : "#cbd5e1" }} />
                    ))}
                  </div>
                  {/* resident robot at its desk, "typing" */}
                  <span className="zf-bob absolute bottom-5 left-[14%] text-2xl sm:text-3xl" aria-hidden>
                    {r.robot}
                  </span>
                  <span className="zf-type absolute bottom-6 left-[38%] text-xs" aria-hidden>
                    💻
                  </span>
                  {night && <span className="absolute right-2 top-6 text-xs opacity-70" aria-hidden>💡</span>}
                </>
              )}
              {r.id === "lobby" && <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px]" style={{ color: night ? "#94a3b8" : "#64748b" }}>hier komen de opdrachten binnen</span>}
            </div>
          );
        })}

        {/* couriers carrying real events */}
        {couriers.map((c) => {
          const pos = c.stage === "start" ? centre("lobby") : centre(c.ev.room);
          return (
            <div key={c.key} className="pointer-events-none absolute z-10" style={{ ...pos, transform: "translate(-50%, -50%)", transition: "left 2.4s ease-in-out, top 2.4s ease-in-out" }}>
              <span className="zf-bob block text-center text-2xl" aria-hidden>
                {c.ev.severity === "critical" ? "🚨" : c.ev.severity === "warning" ? "⚠️" : "🤖"}
              </span>
              {c.stage === "arrived" && (
                <div className="mt-1 w-44 rounded-xl bg-white px-2 py-1.5 text-[10px] leading-snug text-slate-800 shadow-lg sm:w-56 sm:text-[11px]">
                  {c.ev.summary}
                </div>
              )}
            </div>
          );
        })}
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
                <span className="flex-shrink-0">{ROOM.get(e.room)?.emoji ?? "•"}</span>
                <span style={{ color: e.severity === "critical" ? "#dc2626" : e.severity === "warning" ? "#d97706" : "var(--a-text)" }}>{e.summary}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
