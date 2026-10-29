"use client";

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as RKeyboardEvent } from "react";

// Lichte, dependency-vrije terminal-UI (geen xterm). Praat met /api/admin/console,
// dat alleen een vaste, veilige set read-only commando's uitvoert (geen shell).

type LineKind = "in" | "out" | "err";
interface Line {
  kind: LineKind;
  text: string;
}

const COLORS: Record<LineKind, string> = { in: "#7dd3fc", out: "#e5e7eb", err: "#f87171" };

export function ConsoleTerminal() {
  const [lines, setLines] = useState<Line[]>([
    { kind: "out", text: "ZekerFlex admin-console — typ 'help'. (veilig, geen shell)" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  async function submit() {
    const cmd = input.trim();
    if (!cmd || busy) return;
    setLines((l) => [...l, { kind: "in", text: `$ ${cmd}` }]);
    setHistory((h) => [...h, cmd]);
    setHistIdx(null);
    setInput("");
    if (cmd === "clear") {
      setLines([]);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/terminal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const d = (await res.json().catch(() => ({ output: "Fout bij uitvoeren.", ok: false }))) as { output?: string; ok?: boolean };
      setLines((l) => [...l, { kind: d.ok ? "out" : "err", text: String(d.output ?? "") }]);
    } catch {
      setLines((l) => [...l, { kind: "err", text: "Netwerkfout." }]);
    } finally {
      setBusy(false);
    }
  }

  function recall(dir: number) {
    if (history.length === 0) return;
    const base = histIdx === null ? history.length : histIdx;
    const next = Math.min(history.length, Math.max(0, base + dir));
    setHistIdx(next);
    setInput(next >= history.length ? "" : history[next] ?? "");
  }

  function onKey(e: RKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void submit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      recall(-1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      recall(1);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-hairstrong font-mono text-xs" style={{ background: "#0C0E12", color: "#e5e7eb" }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.1)", color: "#9ca3af" }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ef4444" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#eab308" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#22c55e" }} />
        <span className="ml-2">zekerflex-console</span>
      </div>
      <div className="h-80 space-y-1 overflow-y-auto p-3">
        {lines.map((l, i) => (
          <pre key={i} className="whitespace-pre-wrap break-words" style={{ color: COLORS[l.kind], margin: 0 }}>
            {l.text}
          </pre>
        ))}
        {busy && <pre style={{ color: "#6b7280", margin: 0 }}>…</pre>}
        <div ref={endRef} />
      </div>
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <span style={{ color: "#4ade80" }}>$</span>
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={busy}
          spellCheck={false}
          placeholder="typ een commando, bv. help"
          className="flex-1 bg-transparent outline-none"
          style={{ color: "#e5e7eb" }}
          aria-label="Console-commando"
        />
      </div>
    </div>
  );
}
