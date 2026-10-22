"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Msg {
  role: "user" | "assistant";
  content: string;
  links?: { label: string; href: string }[];
  sources?: { title: string; source: string; href?: string }[];
  mode?: "model" | "rules";
}

/**
 * The ZekerFlex assistant ("brein"): answers from the user's own data and the
 * knowledge base. Read-only — it explains and links to the right screen.
 */
export function BrainChat({ onClose }: { onClose?: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [starters, setStarters] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/brain", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setMsgs(d.turns ?? []);
        setStarters(d.starters ?? []);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setInput("");
    setSuggestions([]);
    setMsgs((m) => [...m, { role: "user", content: question }]);
    setBusy(true);
    try {
      const r = await fetch("/api/brain", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? "Er ging iets mis.");
      setMsgs((m) => [...m, { role: "assistant", content: d.answer, links: d.links, sources: d.sources, mode: d.mode }]);
      setSuggestions(d.suggestions ?? []);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  const chips = msgs.length ? suggestions : starters;

  return (
    <div className="flex h-full min-h-0 flex-col bg-paper-soft">
      <div className="flex items-center gap-3 border-b border-hair bg-white px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-lg">✨</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold text-ink">ZekerFlex-assistent</p>
          <p className="text-[11px] text-neutralx-500">Kent je klussen, uren en uitbetalingen · voert zelf niets uit</p>
        </div>
        {msgs.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              await fetch("/api/brain", { method: "DELETE" }).catch(() => undefined);
              setMsgs([]);
              setSuggestions([]);
            }}
            className="text-xs text-neutralx-500 hover:text-ink"
          >
            Vergeet gesprek
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Sluiten" className="px-1 text-xl leading-none text-neutralx-500 hover:text-ink">
            ×
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div className="rounded-2xl bg-white p-4 text-sm text-neutralx-700 shadow-sm">
            Hoi! Vraag me iets over je klussen, uren, uitbetalingen of hoe ZekerFlex werkt.
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${m.role === "user" ? "bg-brand-600 text-white" : "bg-white text-ink"}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.links && m.links.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.links.map((l) => (
                    <Link key={l.href} href={l.href} onClick={() => onClose?.()} className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100">
                      {l.label} →
                    </Link>
                  ))}
                </div>
              )}
              {m.sources && m.sources.length > 0 && (
                <details className="mt-1.5 text-[11px] text-neutralx-500">
                  <summary className="cursor-pointer">Bronnen{m.mode === "rules" ? " · zonder AI-model" : ""}</summary>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                    {m.sources.map((s, j) => (
                      <li key={j}>
                        {s.href ? (
                          <Link href={s.href} className="underline">
                            {s.title}
                          </Link>
                        ) : (
                          s.title
                        )}{" "}
                        <span className="text-neutralx-400">({s.source})</span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="w-16 rounded-2xl bg-white px-3.5 py-2.5 text-sm text-neutralx-400 shadow-sm">…</div>}
        <div ref={end} />
      </div>

      {chips.length > 0 && !busy && (
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
          {chips.map((s) => (
            <button key={s} type="button" onClick={() => void ask(s)} className="shrink-0 rounded-full border border-hairstrong bg-white px-3 py-1.5 text-xs text-ink hover:bg-paper-soft">
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(input);
        }}
        className="flex gap-2 border-t border-hair bg-white px-3 py-3"
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={1500} placeholder="Stel je vraag…" className="field-input flex-1 py-2 text-sm" />
        <button type="submit" disabled={busy || !input.trim()} className="btn-primary px-4 py-2 text-sm disabled:opacity-50">
          Vraag
        </button>
      </form>
    </div>
  );
}
