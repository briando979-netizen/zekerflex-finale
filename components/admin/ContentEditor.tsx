"use client";

import { useEffect, useState } from "react";

interface Item {
  key: string;
  label: string;
  default: string;
  group?: string;
  multiline?: boolean;
}

export function ContentEditor() {
  const [registry, setRegistry] = useState<Item[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/content", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.registry) {
          setRegistry(d.registry);
          setValues(d.values ?? {});
          setDraft(d.values ?? {});
        }
      })
      .catch(() => undefined);
  }, []);

  const save = async (key: string, value: string) => {
    setBusy(key);
    setSavedKey(null);
    try {
      const r = await fetch("/api/admin/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (r.ok) {
        const d = await r.json();
        setValues(d.values ?? {});
        setDraft((prev) => ({ ...prev, ...(d.values ?? {}) }));
        setSavedKey(key);
      }
    } finally {
      setBusy(null);
    }
  };

  const panel = { background: "var(--a-elev)", border: "1px solid var(--a-border)" };
  const mute = { color: "var(--a-mute)" };
  const fieldStyle = { background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-text)" };

  return (
    <div className="rounded-xl p-4" style={panel}>
      <p className="mb-1 text-sm font-semibold" style={{ color: "var(--a-text)" }}>
        Teksten op de site
      </p>
      <p className="mb-4 text-xs" style={mute}>
        Pas de belangrijkste teksten aan zonder code. Leeg laten of op &ldquo;Standaard&rdquo; zetten geeft exact de
        oorspronkelijke tekst terug. Wijzigingen zijn direct live na opslaan.
      </p>

      <div className="space-y-6">
        {groupBy(registry).map(([group, items]) => (
          <details key={group} open className="rounded-lg" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}>
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold" style={{ color: "var(--a-text)" }}>
              {group}
              {items.some((i) => (values[i.key] ?? i.default) !== i.default) && (
                <span className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}>
                  aangepast
                </span>
              )}
            </summary>
            <div className="space-y-5 px-3 pb-4 pt-1">
              {items.map((item) => {
          const current = draft[item.key] ?? "";
          const isOverridden = (values[item.key] ?? item.default) !== item.default;
          const dirty = current !== (values[item.key] ?? item.default);
          return (
            <div key={item.key}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-xs font-medium" style={{ color: "var(--a-text)" }}>
                  {item.label}
                </span>
                {isOverridden && (
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: "rgba(52,211,153,0.15)", color: "#34d399" }}>
                    aangepast
                  </span>
                )}
              </div>
              {item.multiline ? (
                <textarea
                  value={current}
                  onChange={(e) => setDraft((p) => ({ ...p, [item.key]: e.target.value }))}
                  rows={3}
                  className="w-full resize-y rounded-lg px-3 py-2 text-sm"
                  style={fieldStyle}
                />
              ) : (
                <input
                  type="text"
                  value={current}
                  onChange={(e) => setDraft((p) => ({ ...p, [item.key]: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={fieldStyle}
                />
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => save(item.key, current)}
                  disabled={busy === item.key || !dirty}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                  style={{ background: "var(--a-accent, #0E5C4A)" }}
                >
                  {busy === item.key ? "Opslaan…" : "Opslaan"}
                </button>
                {isOverridden && (
                  <button
                    type="button"
                    onClick={() => save(item.key, "")}
                    disabled={busy === item.key}
                    className="text-xs font-medium hover:underline disabled:opacity-40"
                    style={mute}
                  >
                    Standaard herstellen
                  </button>
                )}
                {savedKey === item.key && !dirty && (
                  <span className="text-xs font-semibold" style={{ color: "#34d399" }}>
                    Opgeslagen ✓
                  </span>
                )}
              </div>
            </div>
          );
              })}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function groupBy(items: Item[]): [string, Item[]][] {
  const order: string[] = [];
  const map = new Map<string, Item[]>();
  for (const it of items) {
    const g = it.group ?? "Overig";
    if (!map.has(g)) {
      map.set(g, []);
      order.push(g);
    }
    map.get(g)!.push(it);
  }
  return order.map((g) => [g, map.get(g)!]);
}
