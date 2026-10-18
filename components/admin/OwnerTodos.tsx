"use client";

import { useCallback, useEffect, useState } from "react";

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

/** /admin/te-doen — what only the owner can do, auto-checked where possible, plus own notes. */
export function OwnerTodos() {
  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [custom, setCustom] = useState<Custom[]>([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const apply = (d: { todos: Todo[]; custom: Custom[] }) => {
    setTodos(d.todos);
    setCustom(d.custom);
  };
  const load = useCallback(async () => {
    const r = await fetch("/api/admin/todos", { cache: "no-store" }).catch(() => null);
    if (r?.ok) apply(await r.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: unknown) {
    const r = await fetch("/api/admin/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    if (r?.ok) apply(await r.json());
  }

  if (!todos) return <p className="py-10 text-center text-sm" style={{ color: "var(--a-mute)" }}>Laden…</p>;
  const left = todos.filter((t) => !t.done).length;
  const groups = [...new Set(todos.map((t) => t.group))];

  return (
    <div className="space-y-6">
      <div className="a-panel flex flex-wrap items-center gap-4 p-5">
        <div className="min-w-[12rem] flex-1">
          <p className="font-display text-2xl font-bold" style={{ color: "var(--a-text)" }}>
            {left === 0 ? "Alles gedaan 🎉" : `Nog ${left} van ${todos.length} te doen`}
          </p>
          <p className="text-sm" style={{ color: "var(--a-dim)" }}>Taken met ⚙️ vinken zichzelf af zodra ZekerFlex ziet dat ze klaar zijn.</p>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full sm:w-48" style={{ background: "var(--a-panel-2)" }}>
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(((todos.length - left) / todos.length) * 100)}%` }} />
        </div>
        <button type="button" className="a-button" onClick={() => load()}>
          Opnieuw controleren
        </button>
      </div>

      {groups.map((g) => (
        <section key={g} className="a-panel p-5">
          <h2 className="mb-3 font-display text-lg font-semibold" style={{ color: "var(--a-text)" }}>{g}</h2>
          <ul className="space-y-2">
            {todos
              .filter((t) => t.group === g)
              .map((t) => (
                <li key={t.id} className="rounded-xl px-4 py-3" style={{ background: "var(--a-elev)" }}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={t.done}
                      disabled={t.auto}
                      onChange={(e) => post({ action: "toggle", id: t.id, done: e.target.checked })}
                      className="mt-1 h-4 w-4"
                      title={t.auto ? "Wordt automatisch gecontroleerd" : "Afvinken"}
                    />
                    <button type="button" onClick={() => setOpen(open === t.id ? null : t.id)} className="min-w-0 flex-1 text-left">
                      <span className={`block text-sm font-semibold ${t.done ? "line-through opacity-60" : ""}`} style={{ color: "var(--a-text)" }}>
                        {t.auto ? "⚙️ " : ""}
                        {t.title}
                      </span>
                      <span className="block text-xs" style={{ color: "var(--a-dim)" }}>{t.why}</span>
                      {t.doneNote && <span className="block text-[11px]" style={{ color: "var(--a-mute)" }}>{t.doneNote}</span>}
                    </button>
                    <span className="text-xs" style={{ color: t.done ? "#10b981" : "#d97706" }}>{t.done ? "klaar" : "te doen"}</span>
                  </div>
                  {open === t.id && (
                    <ol className="mt-2 list-decimal space-y-1 pl-10 text-sm" style={{ color: "var(--a-text)" }}>
                      {t.how.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}

      <section className="a-panel space-y-3 p-5">
        <h2 className="font-display text-lg font-semibold" style={{ color: "var(--a-text)" }}>📝 Mijn notities & eigen taken</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            void post({ action: "add", text });
            setText("");
          }}
          className="flex gap-2"
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Notitie of taak toevoegen…" className="a-input flex-1" />
          <button type="submit" className="a-button a-button-primary">
            Toevoegen
          </button>
        </form>
        {custom.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen eigen notities.</p>
        ) : (
          <ul className="space-y-1.5">
            {custom.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--a-elev)" }}>
                <input type="checkbox" checked={c.done} onChange={(e) => post({ action: "custom", id: c.id, done: e.target.checked })} className="h-4 w-4" />
                <span className={`flex-1 ${c.done ? "line-through opacity-60" : ""}`} style={{ color: "var(--a-text)" }}>{c.text}</span>
                <span className="text-[11px]" style={{ color: "var(--a-mute)" }}>{new Date(c.at).toLocaleDateString("nl-NL")}</span>
                <button type="button" onClick={() => post({ action: "custom", id: c.id, remove: true })} className="text-xs" style={{ color: "var(--a-mute)" }}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
