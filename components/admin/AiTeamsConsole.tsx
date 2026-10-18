"use client";

import { useCallback, useEffect, useState } from "react";

interface Team {
  id: string;
  name: string;
  emoji: string;
  mission: string;
  members: string[];
  needsModel: boolean;
}
interface FeedItem {
  id: string;
  team: string;
  at: string;
  text: string;
  kind: "done" | "finding" | "proposal" | "idea" | "error";
}
interface Proposal {
  id: string;
  team: string;
  at: string;
  title: string;
  detail: string;
  status: string;
  result?: string;
}
interface Data {
  teams: Team[];
  feed: FeedItem[];
  proposals: Proposal[];
  done: Proposal[];
  lastRun: string | null;
  modelConnected: boolean;
}

const KIND: Record<FeedItem["kind"], string> = { done: "✓", finding: "🔎", proposal: "📝", idea: "💡", error: "⚠️" };

/** /admin/ai-teams — the teams at work, their live report and proposals. */
export function AiTeamsConsole() {
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("alle");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/ai-teams", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setD(await r.json());
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    await fetch("/api/admin/ai-teams", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setBusy(null);
    void load();
  }

  if (!d) return <p className="py-10 text-center text-sm" style={{ color: "var(--a-mute)" }}>Laden…</p>;
  const team = (id: string) => d.teams.find((t) => t.id === id);
  const shown = filter === "alle" ? d.feed : d.feed.filter((f) => f.team === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "var(--a-panel-2)", color: "var(--a-text)" }}>
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> live
        </span>
        <span className="text-sm" style={{ color: "var(--a-dim)" }}>
          {d.lastRun ? `Laatste ronde: ${new Date(d.lastRun).toLocaleString("nl-NL")}` : "Nog geen ronde gedraaid"} · draait elke dag vanzelf
        </span>
        <button type="button" className="a-button a-button-primary ml-auto" disabled={busy === "run"} onClick={() => post({ action: "run" }, "run")}>
          {busy === "run" ? "Teams aan het werk…" : "Nu een ronde draaien"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {d.teams.map((t) => {
          const active = !t.needsModel || d.modelConnected;
          const n = d.feed.filter((f) => f.team === t.id).length;
          return (
            <button key={t.id} type="button" onClick={() => setFilter(filter === t.id ? "alle" : t.id)} className="a-panel p-4 text-left" style={filter === t.id ? { outline: "2px solid #10b981" } : {}}>
              <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                {t.emoji} {t.name}
              </p>
              <p className="mt-1 text-xs leading-snug" style={{ color: "var(--a-dim)" }}>{t.mission}</p>
              <p className="mt-2 text-[11px]" style={{ color: "var(--a-mute)" }}>🤖 {t.members.join(" · ")}</p>
              <p className="mt-1 text-[11px] font-semibold" style={{ color: active ? "#10b981" : "var(--a-mute)" }}>{active ? `aan het werk · ${n} meldingen` : "wacht op taalmodel"}</p>
            </button>
          );
        })}
      </div>

      <section className="a-panel p-5">
        <h2 className="font-display text-lg font-semibold" style={{ color: "var(--a-text)" }}>Klaar om uit te voeren ({d.proposals.length})</h2>
        <p className="mb-3 text-xs" style={{ color: "var(--a-mute)" }}>Acties die buiten ZekerFlex gaan (een mail aan een klant, een webhook opnieuw versturen) zetten de teams klaar — jij voert ze met één klik uit.</p>
        {d.proposals.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Niets te doen.</p>
        ) : (
          <ul className="space-y-2">
            {d.proposals.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl px-4 py-3" style={{ background: "var(--a-elev)" }}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold" style={{ color: "var(--a-text)" }}>
                    {team(p.team)?.emoji} {p.title}
                  </span>
                  <span className="block text-xs" style={{ color: "var(--a-dim)" }}>{p.detail}</span>
                </span>
                <button type="button" className="a-button a-button-primary" disabled={busy === p.id} onClick={() => post({ action: "approve", id: p.id }, p.id)}>
                  {busy === p.id ? "Bezig…" : "Uitvoeren"}
                </button>
                <button type="button" className="a-button" disabled={busy === p.id} onClick={() => post({ action: "dismiss", id: p.id }, p.id)}>
                  Negeren
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="a-panel p-5">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold" style={{ color: "var(--a-text)" }}>Live verslag</h2>
          {filter !== "alle" && (
            <button type="button" className="text-xs underline" style={{ color: "var(--a-dim)" }} onClick={() => setFilter("alle")}>
              alle teams tonen
            </button>
          )}
        </div>
        {shown.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen meldingen — draai een ronde.</p>
        ) : (
          <ul className="max-h-[32rem] space-y-1.5 overflow-y-auto text-sm">
            {shown.map((f) => (
              <li key={f.id} className="flex gap-2">
                <span className="w-24 flex-shrink-0 font-mono text-xs" style={{ color: "var(--a-mute)" }}>
                  {new Date(f.at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="w-5 flex-shrink-0">{KIND[f.kind]}</span>
                <span style={{ color: f.kind === "error" ? "#dc2626" : "var(--a-text)" }}>
                  <strong>{team(f.team)?.name ?? f.team}:</strong> {f.text}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
