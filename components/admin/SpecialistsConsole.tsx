"use client";

import { useCallback, useEffect, useState } from "react";

interface Spec {
  id: string;
  name: string;
  emoji: string;
  role: string;
  placeholder: string;
  offline: boolean;
}
interface LogItem {
  at: string;
  by: string;
  input: string;
  answer: string;
  mode: "model" | "offline";
}

/** Minimal markdown: headings, bold, italics, bullet lists. */
function Rich({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-ink">
      {text.split(/\n{2,}/).map((block, i) => {
        const fmt = (s: string) =>
          s.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((part, j) =>
            part.startsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : part.startsWith("_") && part.endsWith("_") ? <em key={j} className="text-neutralx-500">{part.slice(1, -1)}</em> : part,
          );
        if (block.startsWith("## ")) return <h3 key={i} className="font-display text-base font-bold">{fmt(block.slice(3))}</h3>;
        const lines = block.split("\n");
        if (lines.some((l) => l.startsWith("- "))) {
          return (
            <div key={i}>
              {lines.filter((l) => !l.startsWith("- ")).map((l, k) => (
                <p key={k}>{fmt(l)}</p>
              ))}
              <ul className="list-disc space-y-0.5 pl-5">
                {lines.filter((l) => l.startsWith("- ")).map((l, k) => (
                  <li key={k}>{fmt(l.slice(2))}</li>
                ))}
              </ul>
            </div>
          );
        }
        return <p key={i} className="whitespace-pre-line">{fmt(block)}</p>;
      })}
    </div>
  );
}

/** /admin/specialisten — ask the AI jurist, taxateur and the other specialists. */
export function SpecialistsConsole() {
  const [specs, setSpecs] = useState<Spec[]>([]);
  const [connected, setConnected] = useState(true);
  const [active, setActive] = useState("jurist");
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState<{ text: string; mode: string } | null>(null);
  const [log, setLog] = useState<LogItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/specialists", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setSpecs(d.specialists);
        setConnected(d.modelConnected);
      });
  }, []);
  const loadLog = useCallback(async (id: string) => {
    const r = await fetch(`/api/admin/specialists?id=${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setLog((await r.json()).log);
  }, []);
  useEffect(() => {
    void loadLog(active);
    setAnswer(null);
  }, [active, loadLog]);

  const spec = specs.find((s) => s.id === active);

  async function ask() {
    setBusy(true);
    setAnswer(null);
    const r = await fetch("/api/admin/specialists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: active, input }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    setAnswer(r?.ok ? { text: d.answer, mode: d.mode } : { text: d?.error?.message ?? "Dat lukte niet.", mode: "error" });
    void loadLog(active);
  }

  return (
    <div className="space-y-5">
      {!connected && (
        <p className="rounded-xl border border-warn/30 bg-warn/5 px-4 py-3 text-sm text-ink">
          Het taalmodel is nog niet gekoppeld. De <strong>jurist</strong> (contractcheck) en de <strong>taxateur</strong> (marktwaarde uit echte ZekerFlex-data) werken al; de andere specialisten zodra de AI-node draait.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {specs.map((s) => (
          <button key={s.id} type="button" onClick={() => setActive(s.id)} className={`rounded-xl border p-3 text-left ${active === s.id ? "border-brand-500 bg-brand-50" : "border-hair bg-white hover:border-hairstrong"}`}>
            <span className="block text-sm font-semibold text-ink">
              {s.emoji} {s.name}
            </span>
            <span className="block text-xs text-neutralx-500">{s.role}</span>
            {!connected && <span className={`mt-1 inline-block text-[10px] font-semibold ${s.offline ? "text-ok" : "text-neutralx-400"}`}>{s.offline ? "werkt nu al" : "wacht op taalmodel"}</span>}
          </button>
        ))}
      </div>
      {spec && (
        <div className="card space-y-3 p-5">
          <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={7} placeholder={spec.placeholder} className="w-full rounded-xl border border-hairstrong px-3 py-2 text-base md:text-sm" />
          <button type="button" disabled={busy || input.trim().length < 3} onClick={ask} className="btn-primary text-sm disabled:opacity-50">
            {busy ? `${spec.name} denkt na…` : `Vraag het de ${spec.name}`}
          </button>
          {answer && (
            <div className="rounded-xl border border-hair bg-paper-soft/50 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutralx-400">{answer.mode === "model" ? "Advies (taalmodel + eigen controles) — concept, laat een mens controleren" : "Uit de eigen systemen van ZekerFlex"}</p>
              <Rich text={answer.text} />
            </div>
          )}
        </div>
      )}
      {log.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-hair px-5 py-3 text-sm font-semibold">Eerdere vragen</div>
          <ul className="divide-y divide-hair">
            {log.map((l, i) => (
              <li key={i} className="px-5 py-3 text-sm">
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-medium text-ink">{l.input.slice(0, 120)}</span>
                    <span className="ml-2 text-xs text-neutralx-400">
                      {l.by} · {new Date(l.at).toLocaleString("nl-NL")}
                    </span>
                  </summary>
                  <div className="mt-2">
                    <Rich text={l.answer} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
