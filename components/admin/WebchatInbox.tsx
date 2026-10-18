"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

const STATUS: Record<Row["status"], { label: string; cls: string }> = {
  open: { label: "AI beantwoordt", cls: "bg-brand-50 text-brand-700" },
  human: { label: "Medewerker", cls: "bg-warn/10 text-warn" },
  closed: { label: "Gesloten", cls: "bg-paper-soft text-neutralx-500" },
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
    <div className="grid h-[calc(100vh-11rem)] min-h-[32rem] overflow-hidden rounded-2xl border border-hair bg-white shadow-card md:grid-cols-[minmax(0,22rem)_1fr]">
      <div className={`${active ? "hidden md:flex" : "flex"} min-h-0 flex-col border-hair md:border-r`}>
        <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
          <p className="text-sm font-semibold">Website-chat</p>
          <span className="rounded-full bg-paper-soft px-2 py-0.5 text-[11px] text-neutralx-600">{openCount} open</span>
        </div>
        <div className="flex gap-1 border-b border-hair px-3 py-2 text-xs">
          {(["all", "open", "human", "closed"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-2.5 py-1 ${filter === f ? "bg-ink text-white" : "bg-paper-soft text-neutralx-600"}`}>
              {f === "all" ? "Alles" : STATUS[f].label}
            </button>
          ))}
        </div>
        <ul className="flex-1 divide-y divide-hair overflow-y-auto">
          {rows.length === 0 && <li className="px-4 py-10 text-center text-sm text-neutralx-400">Nog geen gesprekken.</li>}
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => setActive(r.id)} className={`w-full px-4 py-3 text-left ${active === r.id ? "bg-brand-50" : "hover:bg-paper-soft"}`}>
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">Bezoeker {r.id.slice(-5)}</span>
                  {r.unread > 0 && <span className="grid h-4 min-w-4 place-items-center rounded-full bg-crit px-1 text-[10px] font-bold text-white">{r.unread}</span>}
                  <span className="ml-auto text-[10px] text-neutralx-400">{ago(r.lastAt)}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-neutralx-500">{r.preview || "—"}</span>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${active ? "flex" : "hidden md:flex"} min-h-0 flex-col`}>
        {!conv ? (
          <p className="m-auto text-sm text-neutralx-400">Kies een gesprek.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-hair px-4 py-3">
              <button type="button" onClick={() => setActive(null)} className="text-lg md:hidden" aria-label="Terug">
                ‹
              </button>
              <span className="text-sm font-semibold">Bezoeker {conv.id.slice(-5)}</span>
              {conv.page && <span className="text-xs text-neutralx-400">op {conv.page}</span>}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[conv.status].cls}`}>{STATUS[conv.status].label}</span>
              <span className="ml-auto flex gap-2 text-xs">
                {conv.status !== "human" && (
                  <button type="button" disabled={busy} onClick={() => act("takeover")} className="font-semibold text-warn hover:underline">
                    Overnemen
                  </button>
                )}
                {conv.status === "human" && (
                  <button type="button" disabled={busy} onClick={() => act("release")} className="font-semibold text-brand-600 hover:underline">
                    Terug naar AI
                  </button>
                )}
                {conv.status !== "closed" && (
                  <button type="button" disabled={busy} onClick={() => act("close")} className="text-neutralx-500 hover:underline">
                    Sluiten
                  </button>
                )}
              </span>
            </div>
            <div ref={scroll} className="flex-1 space-y-2 overflow-y-auto bg-paper-soft/40 px-4 py-4">
              {conv.messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "" : "flex justify-end"}>
                  <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-white text-ink shadow-sm" : m.role === "agent" ? "bg-brand-500 text-white" : "bg-ink/80 text-white"}`}>
                    <span className="mb-0.5 block text-[10px] opacity-70">
                      {m.role === "user" ? "Bezoeker" : m.role === "agent" ? m.by : "AI-assistent"} · {new Date(m.at).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}
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
              className="flex gap-2 border-t border-hair p-3"
            >
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Antwoord als ZekerFlex (neemt het gesprek over)…" className="flex-1 rounded-xl border border-hairstrong px-3 py-2 text-base md:text-sm" />
              <button type="submit" disabled={busy || !text.trim()} className="btn-primary text-sm disabled:opacity-50">
                Stuur
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
