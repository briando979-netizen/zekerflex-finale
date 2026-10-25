"use client";

import { useEffect, useState } from "react";

// Stel de AI-node-sleutel server-side in (KV) — zodat je 'm NIET meer in Vercel
// hoeft te plakken + redeployen. Dezelfde sleutel zet je op je laptop in het
// AI-node-startscript. Leeg opslaan = terug naar de env-sleutel.
export function AiNodeKey() {
  const [state, setState] = useState<{ custom: boolean; configured: boolean } | null>(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/admin/ai-node/key")
      .then((r) => r.json())
      .then((d) => setState({ custom: Boolean(d.custom), configured: Boolean(d.configured) }))
      .catch(() => setState(null));
  }, []);

  async function save(value: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/ai-node/key", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: value }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? "Opslaan mislukt");
      setState({ custom: Boolean(d.custom), configured: Boolean(d.configured) });
      setKey("");
      setMsg(value.trim() ? "Sleutel opgeslagen — geen redeploy nodig." : "Sleutel gewist (terug naar env).");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}>
      <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
        AI-node-sleutel (laptop)
      </p>
      <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--a-mute)" }}>
        Zet hier dezelfde sleutel als in je laptop-startscript. Dan hoef je niets meer in Vercel te plakken of te
        redeployen — de laptop meldt zijn adres daarna vanzelf aan.
      </p>
      <p className="mt-2 text-xs" style={{ color: state?.configured ? "var(--a-ok, #16a34a)" : "var(--a-mute)" }}>
        {state === null
          ? "Laden…"
          : state.custom
            ? "✓ Eigen sleutel actief (via dit scherm ingesteld)."
            : state.configured
              ? "Sleutel actief via de omgeving (env)."
              : "Nog geen sleutel ingesteld."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Plak hier de sleutel…"
          autoComplete="off"
          className="min-w-[14rem] flex-1 rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--a-bg, #0b0b0c)", border: "1px solid var(--a-border)", color: "var(--a-text)" }}
        />
        <button type="button" disabled={busy || !key.trim()} onClick={() => save(key)} className="a-btn a-btn-primary disabled:opacity-50">
          Opslaan
        </button>
        {state?.custom && (
          <button type="button" disabled={busy} onClick={() => save("")} className="a-btn a-btn-ghost disabled:opacity-50">
            Wissen
          </button>
        )}
      </div>
      {msg && (
        <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>
          {msg}
        </p>
      )}
    </div>
  );
}
