"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { dateNl, percentOf } from "@/lib/admin/format";
import { Empty, KpiStrip, Meter, PageHead, Panel, Pill } from "@/components/admin/kit";

interface Todo {
  id: string;
  group: string;
  title: string;
  why: string;
  how: string[];
  auto: boolean;
  done: boolean;
  doneNote?: string;
}
interface Custom {
  id: string;
  text: string;
  done: boolean;
  at: string;
}

type View = "open" | "done" | "all";

const VIEWS: { id: View; label: string }[] = [
  { id: "open", label: "Te doen" },
  { id: "done", label: "Klaar" },
  { id: "all", label: "Alles" },
];

/** /admin/te-doen — what only the owner can do, auto-checked where possible, plus own notes. */
export function OwnerTodos() {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [custom, setCustom] = useState<Custom[]>([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<View>("open");
  const [checking, setChecking] = useState(false);

  const apply = (d: { todos: Todo[]; custom: Custom[] }) => {
    setTodos(d.todos);
    setCustom(d.custom);
  };
  const load = useCallback(async () => {
    setChecking(true);
    const r = await fetch("/api/admin/todos", { cache: "no-store" }).catch(() => null);
    if (r?.ok) apply(await r.json());
    setChecking(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: unknown) {
    const r = await fetch("/api/admin/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (r?.ok) apply(await r.json());
  }

  const shown = useMemo(() => (todos ?? []).filter((t) => (view === "all" ? true : view === "done" ? t.done : !t.done)), [todos, view]);
  const groups = useMemo(() => [...new Set((todos ?? []).map((t) => t.group))], [todos]);

  const head = (
    <PageHead
      title="Te doen voor jou"
      subtitle="Wat alleen jij kunt regelen: accounts, betaalgegevens en juridische checks. Klik een taak open voor de stappen."
      actions={<button type="button" className="a-button" onClick={() => void load()} disabled={checking}>{checking ? "Controleren…" : "Opnieuw controleren"}</button>}
    />
  );

  if (!todos) {
    return (
      <div className="space-y-4">
        {head}
        <div className="a-panel h-28 animate-pulse" />
      </div>
    );
  }

  const left = todos.filter((t) => !t.done).length;
  const doneCount = todos.length - left;
  const autoCount = todos.filter((t) => t.auto).length;
  const openNotes = custom.filter((c) => !c.done).length;

  return (
    <div className="space-y-4">
      {head}

      <KpiStrip
        items={[
          { label: "Nog te doen", value: left, hint: left === 0 ? "Alles is geregeld" : `van de ${todos.length} taken`, ...(left > 0 ? { tone: "warn" as const } : {}) },
          { label: "Klaar", value: doneCount, hint: `${percentOf(doneCount, todos.length)}% afgerond` },
          { label: "Controleert zichzelf", value: autoCount, hint: "vinkt vanzelf af zodra het klopt" },
          { label: "Eigen notities", value: openNotes, hint: openNotes === 1 ? "staat nog open" : "staan nog open" },
        ]}
      />

      <Panel>
        <Meter label="Voortgang" value={doneCount} max={todos.length} display={`${doneCount} van ${todos.length}`} tone="ok" />
      </Panel>

      <div className="flex flex-wrap items-center gap-0.5" role="group" aria-label="Taken tonen">
        {VIEWS.map((v) => {
          const n = v.id === "all" ? todos.length : v.id === "done" ? doneCount : left;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              aria-pressed={view === v.id}
              className="rounded-md px-2.5 py-1 text-[0.8125rem] font-medium transition-colors"
              style={view === v.id ? { background: "var(--a-elev)", color: "var(--a-text)" } : { color: "var(--a-mute)" }}
            >
              {v.label}
              <span className="num ml-1.5 text-xs" style={{ color: "var(--a-mute)" }}>{n}</span>
            </button>
          );
        })}
      </div>

      {shown.length === 0 && (
        <Panel>
          <Empty title={view === "open" ? "Alles is geregeld" : "Nog niets afgerond"} body={view === "open" ? "Er staat niets meer open dat alleen jij kunt doen." : "Afgeronde taken verschijnen hier."} />
        </Panel>
      )}

      <div className="gap-4 xl:columns-2">
        {groups.map((g) => {
          const list = shown.filter((t) => t.group === g);
          if (list.length === 0) return null;
          const groupLeft = todos.filter((t) => t.group === g && !t.done).length;
          return (
            <Panel key={g} flush className="mb-4 break-inside-avoid" title={g} subtitle={groupLeft === 0 ? "Alles klaar" : `${groupLeft} te doen`}>
              <ul>
                {list.map((t) => (
                  <li key={t.id} style={{ borderTop: "1px solid var(--a-border)" }}>
                    <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
                      <input
                        type="checkbox"
                        checked={t.done}
                        disabled={t.auto}
                        onChange={(e) => void post({ action: "toggle", id: t.id, done: e.target.checked })}
                        className="mt-0.5 h-4 w-4 flex-shrink-0"
                        aria-label={`${t.title} afvinken`}
                        title={t.auto ? "Wordt automatisch gecontroleerd" : "Afvinken"}
                      />
                      <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id} className="min-w-0 flex-1 text-left">
                        <span className={`block text-[0.8125rem] font-medium ${t.done ? "line-through opacity-60" : ""}`} style={{ color: "var(--a-text)" }}>{t.title}</span>
                        <span className="mt-0.5 block text-xs" style={{ color: "var(--a-mute)" }}>{t.why}</span>
                        {t.doneNote && <span className="mt-0.5 block text-xs" style={{ color: "var(--a-dim)" }}>{t.doneNote}</span>}
                      </button>
                      <span className="flex flex-shrink-0 flex-col items-end gap-1">
                        <Pill tone={t.done ? "ok" : "warn"}>{t.done ? "Klaar" : "Te doen"}</Pill>
                        {t.auto && <span className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>automatisch</span>}
                      </span>
                    </div>
                    {open === t.id && t.how.length > 0 && (
                      <ol className="list-decimal space-y-1 pb-3 pl-[3.25rem] pr-5 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
                        {t.how.map((h) => <li key={h}>{h}</li>)}
                      </ol>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          );
        })}
      </div>

      <Panel flush title="Mijn notities & eigen taken" subtitle="Alleen voor jezelf">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void post({ action: "add", text });
            setText("");
          }}
          className="flex gap-2 px-4 pb-3 sm:px-5"
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Notitie of taak toevoegen" aria-label="Notitie of taak toevoegen" className="a-input flex-1" />
          <button type="submit" className="a-button a-button-primary" disabled={!text.trim()}>Toevoegen</button>
        </form>
        {custom.length === 0 ? (
          <Empty title="Nog geen eigen notities" body="Schrijf hierboven iets op dat je niet wilt vergeten." />
        ) : (
          <ul>
            {custom.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-[0.8125rem] sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <input type="checkbox" checked={c.done} onChange={(e) => void post({ action: "custom", id: c.id, done: e.target.checked })} className="h-4 w-4 flex-shrink-0" aria-label={`${c.text} afvinken`} />
                <span className={`min-w-0 flex-1 ${c.done ? "line-through opacity-60" : ""}`} style={{ color: "var(--a-text)" }}>{c.text}</span>
                <span className="flex-shrink-0 text-xs" style={{ color: "var(--a-mute)" }}>{dateNl(c.at, { day: "numeric", month: "short" })}</span>
                <button type="button" onClick={() => void post({ action: "custom", id: c.id, remove: true })} className="flex-shrink-0 text-xs hover:underline" style={{ color: "var(--a-mute)" }} aria-label={`${c.text} verwijderen`}>
                  Verwijderen
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
