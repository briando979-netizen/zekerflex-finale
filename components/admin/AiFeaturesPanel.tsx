"use client";

import { useState } from "react";
import type { AiFeature } from "@/lib/ai/features";

interface TestResult {
  ok: boolean;
  ms?: number;
  model?: string;
  reply?: string;
  error?: string;
  sample?: { description: string; mode: "model" | "rules" };
}

/** Admin → Systeem: every AI feature, what it does with/without the model, and a live test. */
export function AiFeaturesPanel({ features, connected, problem }: { features: AiFeature[]; connected: boolean; problem: string | null }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<TestResult | null>(null);

  return (
    <section className="mt-8 rounded-2xl border border-hair bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hair px-5 py-4">
        <div>
          <h2 className="font-display text-base font-bold text-ink">AI-functies</h2>
          <p className="text-xs text-neutralx-500">
            {connected ? "Taalmodel gekoppeld — alle functies draaien op de AI." : "Geen taalmodel gekoppeld — functies draaien op hun vaste regels (rechterkolom)."}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setRes(null);
            try {
              const r = await fetch("/api/admin/ai/test", { method: "POST" });
              setRes(await r.json());
            } catch (e) {
              setRes({ ok: false, error: (e as Error).message });
            } finally {
              setBusy(false);
            }
          }}
          className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy ? "Testen…" : "Test taalmodel"}
        </button>
      </div>

      {res && (
        <div className={`mx-5 mt-4 rounded-lg px-4 py-3 text-sm ${res.ok ? "bg-brand-50 text-brand-800" : "bg-crit/10 text-crit"}`}>
          {res.ok ? (
            <p>
              ✅ Antwoord van <b>{res.model}</b> in {res.ms} ms: “{res.reply}”
            </p>
          ) : (
            <p>❌ {res.error}</p>
          )}
          {res.sample && (
            <details className="mt-2 text-neutralx-700">
              <summary className="cursor-pointer text-xs">Voorbeeld klus-omschrijving ({res.sample.mode === "model" ? "AI" : "sjabloon"})</summary>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-xs">{res.sample.description}</pre>
            </details>
          )}
        </div>
      )}

      {!connected && problem && (
        <div className="mx-5 mt-4 rounded-lg bg-paper-soft px-4 py-3 text-xs text-neutralx-700">
          <p className="font-semibold text-ink">Zo zet je de AI aan (eigen server, geen externe dienst):</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4">
            <li>Draai op je eigen server: <code>deploy/ai-node/setup.sh</code> (installeert Ollama + Caddy met HTTPS en een sleutel).</li>
            <li>Zet in Vercel → Environment Variables: <code>LLM_BASE_URL</code>, <code>LLM_API_KEY</code> en <code>AI_ALLOW_REMOTE=true</code>.</li>
            <li>Redeploy en klik hierboven op “Test taalmodel”.</li>
          </ol>
          <p className="mt-2 text-neutralx-500">Nu: {problem}</p>
        </div>
      )}

      <div className="overflow-x-auto px-5 py-4">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs text-neutralx-500">
            <tr>
              <th className="pb-2 font-medium">Functie</th>
              <th className="pb-2 font-medium">Voor</th>
              <th className="pb-2 font-medium">Met AI</th>
              <th className="pb-2 font-medium">Zonder AI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair">
            {features.map((f) => (
              <tr key={f.key} className="align-top">
                <td className="py-2 pr-3">
                  <span className="font-medium text-ink">{f.name}</span>
                  <span className="block text-xs text-neutralx-400">{f.where}</span>
                </td>
                <td className="py-2 pr-3 text-xs text-neutralx-600">{f.audience.join(", ")}</td>
                <td className={`py-2 pr-3 text-xs ${connected ? "text-ink" : "text-neutralx-400"}`}>{f.withModel}</td>
                <td className={`py-2 text-xs ${f.withoutModel === "uit" || f.withoutModel.startsWith("uit ") ? "text-crit" : connected ? "text-neutralx-400" : "text-ink"}`}>{f.withoutModel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
