"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pill, type Tone } from "@/components/admin/kit";

interface Row {
  id: string;
  status: "open" | "human" | "closed";
  startedAt: string;
  lastAt: string;
  page: string | null;
  unread: number;
  count: number;
  preview: string;
}
interface Message {
  role: "user" | "assistant" | "agent";
  content: string;
  at: string;
  by?: string;
}
interface Conversation {
  id: string;
  status: Row["status"];
  page?: string;
  messages: Message[];
}

const STATUS: Record<Row["status"], { label: string; tone: Tone }> = {
  open: { label: "AI beantwoordt", tone: "ok" },
  human: { label: "Medewerker", tone: "warn" },
  closed: { label: "Gesloten", tone: "neutral" },
};
const ago = (d: string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  return m < 1 ? "nu" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} u` : new Date(d).toLocaleDateString("nl-NL");
};
const strip = (t: string) => t.split("\n[[")[0];

/** Website-chat tickets: read along, take over, reply live, close. */
export function WebchatInbox() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<"all" | Row["status"]>("all");
  const [active, setActive] = useState<string | null>(null);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const r = await fetch(`/api/admin/webchat${filter === "all" ? "" : `?status=${filter}`}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setRows((await r.json()).conversations);
  }, [filter]);
  const loadConv = useCallback(async (id: string) => {
    const r = await fetch(`/api/admin/webchat?id=${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setConv((await r.json()).conversation);
  }, []);

  useEffect(() => {
    void loadList();
    const t = setInterval(() => void loadList(), 8000);
    return () => clearInterval(t);
  }, [loadList]);
  useEffect(() => {
    if (!active) return;
    void loadConv(active);
    const t = setInterval(() => void loadConv(active), 4000);
    return () => clearInterval(t);
  }, [active, loadConv]);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [conv?.messages.length]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (!active) return;
    setBusy(true);
    const r = await fetch("/api/admin/webchat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: active, ...extra }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) {
      setConv((await r.json()).conversation);
      void loadList();
    }
  }

  const openCount = rows.filter((r) => r.status !== "closed").length;

  return (
    <section className="a-panel grid h-[calc(100dvh-12rem)] min-h-[32rem] overflow-hidden md:grid-cols-[minmax(0,22rem)_1fr]">
      <div className={`${active ? "hidden md:flex" : "flex"} min-h-0 flex-col md:border-r`} style={{ borderColor: "var(--a-border)" }}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--a-border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Gesprekken</p>
          <span className="text-xs" style={{ color: "var(--a-mute)" }}>{openCount} open</span>
        </div>
        <div role="group" aria-label="Gesprekken tonen" className="flex flex-wrap gap-0.5 px-3 py-2" style={{ borderBottom: "1px solid var(--a-border)" }}>
          {(["all", "open", "human", "closed"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
              style={filter === f ? { background: "var(--a-elev)", color: "var(--a-text)" } : { color: "var(--a-mute)" }}
            >
              {f === "all" ? "Alle" : STATUS[f].label}
            </button>
          ))}
        </div>
        <ul className="flex-1 overflow-y-auto">
          {rows.length === 0 && <li className="px-4 py-10 text-center text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>Nog geen gesprekken.</li>}
          {rows.map((r) => (
            <li key={r.id} style={{ borderBottom: "1px solid var(--a-border)" }}>
              <button
                type="button"
                onClick={() => setActive(r.id)}
                aria-current={active === r.id ? "true" : undefined}
                className="w-full px-4 py-3 text-left transition-colors hover:bg-[var(--a-panel-2)]"
                style={active === r.id ? { background: "var(--a-panel-2)", boxShadow: "inset 2px 0 0 var(--a-accent)" } : undefined}
              >
                <span className="flex items-center gap-2">
                  <span className="truncate text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>Bezoeker {r.id.slice(-5)}</span>
                  {r.unread > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold text-white" style={{ background: "var(--a-crit)" }} aria-label={`${r.unread} ongelezen`}>{r.unread}</span>}
                  <span className="ml-auto flex-shrink-0 text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>{ago(r.lastAt)}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs" style={{ color: "var(--a-mute)" }}>{r.preview || "—"}</span>
                <span className="mt-1.5 block"><Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill></span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${active ? "flex" : "hidden md:flex"} min-h-0 flex-col`}>
        {!conv ? (
          <p className="m-auto text-[0.8125rem]" style={{ color: "var(--a-mute)" }}>Kies een gesprek.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--a-border)" }}>
              <button type="button" onClick={() => setActive(null)} className="text-lg md:hidden" style={{ color: "var(--a-dim)" }} aria-label="Terug">‹</button>
              <span className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>Bezoeker {conv.id.slice(-5)}</span>
              {conv.page && <span className="font-mono text-xs" style={{ color: "var(--a-mute)" }}>op {conv.page}</span>}
              <Pill tone={STATUS[conv.status].tone}>{STATUS[conv.status].label}</Pill>
              <span className="ml-auto flex gap-1.5">
                {conv.status !== "human" && <button type="button" disabled={busy} onClick={() => void act("takeover")} className="a-button text-xs">Overnemen</button>}
                {conv.status === "human" && <button type="button" disabled={busy} onClick={() => void act("release")} className="a-button text-xs">Terug naar AI</button>}
                {conv.status !== "closed" && <button type="button" disabled={busy} onClick={() => void act("close")} className="a-button text-xs">Sluiten</button>}
              </span>
            </div>
            <div ref={scroll} className="flex-1 space-y-2 overflow-y-auto px-4 py-4" style={{ background: "var(--a-panel-2)" }}>
              {conv.messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "" : "flex justify-end"}>
                  <div
                    className="max-w-[80%] rounded-2xl px-3 py-2 text-[0.8125rem]"
                    style={
                      m.role === "user"
                        ? { background: "var(--a-panel)", color: "var(--a-text)", border: "1px solid var(--a-border)" }
                        : m.role === "agent"
                          ? { background: "var(--a-accent)", color: "var(--a-on-accent)" }
                          : { background: "var(--a-elev)", color: "var(--a-text)" }
                    }
                  >
                    <span className="mb-0.5 block text-[10px] opacity-70">
                      {m.role === "user" ? "Bezoeker" : m.role === "agent" ? m.by : "AI-assistent"}, {new Date(m.at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" })}
                    </span>
                    <span className="whitespace-pre-line">{strip(m.content)}</span>
                  </div>
                </div>
              ))}
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!text.trim()) return;
                await act("reply", { text });
                setText("");
              }}
              className="flex gap-2 p-3"
              style={{ borderTop: "1px solid var(--a-border)" }}
            >
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Antwoord als ZekerFlex (neemt het gesprek over)" aria-label="Antwoord" className="a-input flex-1 text-base md:text-sm" />
              <button type="submit" disabled={busy || !text.trim()} className="a-button a-button-primary">Versturen</button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
