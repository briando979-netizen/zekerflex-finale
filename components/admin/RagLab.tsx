"use client";

import { useEffect, useState } from "react";

interface LabInfo {
  corpus: Record<string, number>;
  packs: { role: string; version: string; passages: number; chars: number }[];
  cache: Record<string, { entries: number; hits: number }>;
}

type LabResult = Record<string, Record<string, unknown> & { ms: number }>;

const PIPELINES: { key: string; label: string; what: string }[] = [
  { key: "naive", label: "Naive RAG", what: "alleen dense top-k → antwoord (basislijn)" },
  { key: "hybrid", label: "Hybride + RRF", what: "BM25 + brein-vector (+ embeddings), samengevoegd met Reciprocal Rank Fusion" },
  { key: "advanced", label: "Advanced RAG", what: "herschrijven, synoniemen, multi-query, HyDE, rerank + MMR, compressie" },
  { key: "agentic", label: "Agentic RAG", what: "plannen → zoeken → controleren → herformuleren → samenvoegen" },
  { key: "cag", label: "CAG", what: "kennispakket als vaste prefix + semantische antwoord-cache" },
];

/** Admin → Systeem: put one question through every retrieval pipeline and compare. */
export function RagLab() {
  const [info, setInfo] = useState<LabInfo | null>(null);
  const [q, setQ] = useState("Wanneer krijg ik betaald en hoe wijzig ik mijn IBAN?");
  const [role, setRole] = useState("werknemer");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<LabResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadInfo = () =>
    fetch("/api/admin/rag/lab", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => undefined);
  useEffect(() => {
    void loadInfo();
  }, []);

  return (
    <section className="mt-8 rounded-2xl border border-hair bg-white">
      <div className="border-b border-hair px-5 py-4">
        <h2 className="font-display text-base font-bold text-ink">RAG-lab — het brein onder de motorkap</h2>
        <p className="text-xs text-neutralx-500">Eén vraag door elke pijplijn, naast elkaar. Alleen lezen.</p>
      </div>

      {info && (
        <div className="grid gap-3 px-5 pt-4 text-xs text-neutralx-600 sm:grid-cols-3">
          <div>
            <p className="font-semibold text-ink">Kenniscorpus</p>
            {Object.entries(info.corpus).map(([k, v]) => (
              <p key={k}>
                {k}: {v}
              </p>
            ))}
          </div>
          <div>
            <p className="font-semibold text-ink">CAG-kennispakketten</p>
            {info.packs.map((p) => (
              <p key={p.role}>
                {p.role}: {p.passages} stukken · {Math.round(p.chars / 4)} tokens · v{p.version}
              </p>
            ))}
          </div>
          <div>
            <p className="font-semibold text-ink">Antwoord-cache</p>
            {Object.entries(info.cache).map(([k, v]) => (
              <p key={k}>
                {k}: {v.entries} antwoorden · {v.hits} keer hergebruikt
              </p>
            ))}
            <button
              type="button"
              onClick={async () => {
                if (!window.confirm("Antwoord-cache legen?")) return;
                await fetch("/api/admin/rag/lab", { method: "DELETE" });
                void loadInfo();
              }}
              className="mt-1 text-crit underline"
            >
              Cache legen
            </button>
          </div>
        </div>
      )}

      <form
        className="flex flex-wrap gap-2 px-5 py-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          try {
            const r = await fetch("/api/admin/rag/lab", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q, role }) });
            const d = await r.json();
            if (!r.ok) throw new Error(d?.error?.message ?? "Mislukt");
            setRes(d);
          } catch (e2) {
            setErr((e2 as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} className="field-input min-w-[220px] flex-1 py-2 text-sm" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="field-input w-auto py-2 text-sm">
          <option value="public">bezoeker</option>
          <option value="werknemer">werknemer</option>
          <option value="opdrachtgever">opdrachtgever</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" disabled={busy || q.trim().length < 2} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          {busy ? "Bezig…" : "Vergelijk"}
        </button>
      </form>
      {err && <p className="px-5 pb-3 text-sm text-crit">{err}</p>}

      {res && (
        <div className="grid gap-3 px-5 pb-5 md:grid-cols-2">
          {PIPELINES.map((p) => {
            const r = res[p.key];
            if (!r) return null;
            const { ms, ...rest } = r;
            return (
              <div key={p.key} className="rounded-xl border border-hair p-3">
                <p className="flex items-center justify-between text-sm font-semibold text-ink">
                  {p.label}
                  <span className="font-mono text-[11px] font-normal text-neutralx-400">{ms} ms</span>
                </p>
                <p className="mb-2 text-[11px] text-neutralx-500">{p.what}</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-paper-soft p-2 text-[11px] text-neutralx-700">{JSON.stringify(rest, null, 2)}</pre>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
