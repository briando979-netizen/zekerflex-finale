"use client";

import { useEffect, useState } from "react";
import { AVAILABLE_SCOPES } from "@/lib/integrations/scopes";

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  revokedAt: string | null;
  createdAt: string;
}

export function WerkgeverApiKeysBoard({ allowedScopes }: { allowedScopes: readonly string[] }) {
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<{ prefix: string; raw: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const scopeOptions = AVAILABLE_SCOPES.filter((s) => allowedScopes.includes(s.key));

  async function refresh() {
    const res = await fetch("/api/werkgever/api-keys", { cache: "no-store" });
    if (res.ok) setKeys((await res.json()).keys);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleScope(k: string) {
    setSelectedScopes((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  }

  async function create() {
    if (!name.trim() || selectedScopes.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/werkgever/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes: selectedScopes }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewKey({ prefix: d.prefix, raw: d.raw });
        setName("");
        setSelectedScopes([]);
        void refresh();
      } else {
        setMsg(d?.error?.message ?? "Aanmaken mislukt.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function rotate(id: string) {
    const h = window.prompt("Nieuwe sleutel maken. Hoeveel uur mag de oude sleutel nog werken, zodat je koppelingen kunt omzetten? (0–168)", "24");
    if (h === null) return;
    const res = await fetch(`/api/werkgever/api-keys/${id}/rotate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ graceHours: Math.max(0, Math.min(168, Number(h) || 0)) }) });
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      setNewKey({ prefix: d.prefix, raw: d.raw });
      void refresh();
    } else setMsg(d?.error?.message ?? "Vernieuwen mislukt.");
  }

  async function revoke(id: string) {
    if (!window.confirm("Deze sleutel intrekken? Dit kan niet ongedaan worden gemaakt.")) return;
    const res = await fetch(`/api/werkgever/api-keys/${id}/revoke`, { method: "POST" });
    if (res.ok) void refresh();
  }

  return (
    <div className="space-y-5">
      {newKey && (
        <div className="rounded-xl border border-brand-mint/40 bg-mintwash p-4">
          <p className="text-sm font-semibold text-ink">Sleutel aangemaakt — bewaar hem nu</p>
          <p className="mt-1 text-xs text-neutralx-600">
            Dit is de enige keer dat de volledige sleutel getoond wordt.
          </p>
          <code className="mt-2 block break-all rounded-lg border border-hairstrong bg-white px-3 py-2 text-xs">
            {newKey.raw}
          </code>
          <button type="button" onClick={() => setNewKey(null)} className="btn-ghost mt-2 text-xs">
            Ik heb hem bewaard
          </button>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-hairstrong p-4">
        <p className="text-sm font-semibold text-ink">Nieuwe sleutel</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Naam, bijv. Boekhoudkoppeling"
          className="field-input w-full"
        />
        <div className="flex flex-wrap gap-2">
          {scopeOptions.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => toggleScope(s.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                selectedScopes.includes(s.key)
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-hairstrong text-neutralx-600 hover:border-brand-500"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {scopeOptions.length === 0 && (
          <p className="text-xs text-neutralx-500">Je huidige abonnement biedt geen scopes — upgrade hierboven.</p>
        )}
        {msg && <p className="text-sm text-crit">{msg}</p>}
        <button
          type="button"
          onClick={create}
          disabled={busy || !name.trim() || selectedScopes.length === 0}
          className="btn-primary text-sm disabled:opacity-50"
        >
          {busy ? "Bezig…" : "Sleutel aanmaken"}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-hairstrong">
        {!keys ? (
          <div className="space-y-px">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-12 animate-pulse bg-paper-soft" />)}</div>
        ) : keys.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-neutralx-400">Nog geen sleutels aangemaakt.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{k.name}</p>
                  <p className="truncate text-xs text-neutralx-400">
                    <code>{k.prefix}…</code> · {k.scopes.join(", ")}
                  </p>
                </div>
                {k.revokedAt && new Date(k.revokedAt) <= new Date() ? (
                  <span className="pill-neutral flex-shrink-0">ingetrokken</span>
                ) : k.revokedAt ? (
                  <span className="flex-shrink-0 text-xs text-warn">vervangen · werkt nog tot {new Date(k.revokedAt).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                ) : (
                  <span className="flex flex-shrink-0 gap-1">
                    <button type="button" onClick={() => rotate(k.id)} className="btn-ghost text-xs">
                      Vernieuwen
                    </button>
                    <button type="button" onClick={() => revoke(k.id)} className="btn-ghost text-xs text-crit">
                      Intrekken
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
