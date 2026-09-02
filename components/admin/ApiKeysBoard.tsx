"use client";

import { useEffect, useState } from "react";

interface Scope {
  key: string;
  label: string;
}
interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  tenant: { id: string; name: string } | null;
  createdBy: { fullName: string } | null;
}

export function ApiKeysBoard({ tenants }: { tenants: { id: string; name: string }[] }) {
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [name, setName] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<{ prefix: string; raw: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/api-keys", { cache: "no-store" });
    if (res.ok) {
      const d = await res.json();
      setKeys(d.keys);
      setScopes(d.scopes);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  function toggleScope(k: string) {
    setSelectedScopes((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  }

  async function create() {
    if (!name.trim() || selectedScopes.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ...(tenantId ? { tenantId } : {}), scopes: selectedScopes }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setNewKey({ prefix: d.prefix, raw: d.raw });
        setName("");
        setTenantId("");
        setSelectedScopes([]);
        void refresh();
      } else {
        setMsg(d?.error?.message ?? "Aanmaken mislukt.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm("Deze sleutel intrekken? Dit kan niet ongedaan worden gemaakt.")) return;
    const res = await fetch(`/api/admin/api-keys/${id}/revoke`, { method: "POST" });
    if (res.ok) void refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">API & integraties</h1>
        <p className="mt-1 text-sm text-neutralx-600">
          Geef externe systemen — een boekhoudkoppeling, een partner, een bedrijf dat zijn eigen tooling wil
          aansluiten — een sleutel om de publieke ZekerFlex-API te gebruiken.
        </p>
      </div>

      {newKey && (
        <div className="card space-y-2 border-brand-mint/40 bg-mintwash p-5">
          <p className="text-sm font-semibold text-ink">Sleutel aangemaakt — bewaar hem nu</p>
          <p className="text-xs text-neutralx-600">
            Dit is de enige keer dat de volledige sleutel getoond wordt. Geef hem door aan de partij die de API
            gebruikt.
          </p>
          <code className="block break-all rounded-lg border border-hairstrong bg-white px-3 py-2 text-xs">
            {newKey.raw}
          </code>
          <button type="button" onClick={() => setNewKey(null)} className="btn-ghost text-xs">
            Ik heb hem bewaard
          </button>
        </div>
      )}

      <div className="card space-y-3 p-5">
        <p className="text-sm font-semibold text-ink">Nieuwe sleutel</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Naam, bijv. Boekhoudkoppeling Acme BV"
          className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
        />
        <select
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          className="w-full rounded-lg border border-hairstrong bg-white px-3 py-2 text-sm"
        >
          <option value="">Platformbreed (alle organisaties)</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>
              Alleen {t.name}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          {scopes.map((s) => (
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

      <div className="card overflow-hidden">
        <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Actieve en ingetrokken sleutels</div>
        {!keys ? (
          <div className="space-y-px">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse bg-paper-soft" />)}</div>
        ) : keys.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-neutralx-400">Nog geen sleutels aangemaakt.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-4 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{k.name}</p>
                  <p className="truncate text-xs text-neutralx-400">
                    <code>{k.prefix}…</code> · {k.tenant?.name ?? "platformbreed"} · {k.scopes.join(", ")}
                  </p>
                </div>
                {k.revokedAt ? (
                  <span className="pill-neutral flex-shrink-0">ingetrokken</span>
                ) : (
                  <button type="button" onClick={() => revoke(k.id)} className="btn-ghost flex-shrink-0 text-xs text-crit">
                    Intrekken
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-neutralx-500">
        Gebruik: <code>Authorization: Bearer zf_live_…</code> op bijvoorbeeld{" "}
        <code>GET /api/public/v1/shifts</code>.
      </p>
    </div>
  );
}
