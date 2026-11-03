"use client";

import { useState, type ReactNode } from "react";

// Kleine bouwstenen voor het tabblad App: een genummerde stap zoals in Play
// Console, een kopieerknop en een knop die eerst om bevestiging vraagt.

export function Stap({ nr, titel, klaar, open, children }: { nr: number; titel: string; klaar: boolean; open: boolean; children: ReactNode }) {
  const [uit, setUit] = useState(open);
  return (
    <section className="rounded-xl border border-hair bg-white">
      <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={uit} onClick={() => setUit(!uit)}>
        <span
          className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-sm font-semibold ${klaar ? "bg-emerald-600 text-white" : "bg-paper-soft text-neutralx-600 ring-1 ring-hair"}`}
          aria-hidden
        >
          {klaar ? "✓" : nr}
        </span>
        <span className="min-w-0 flex-1 font-semibold text-ink">{titel}</span>
        <span className="text-xs text-neutralx-500">{klaar ? "Klaar" : uit ? "Verberg" : "Open"}</span>
      </button>
      {uit && <div className="space-y-3 border-t border-hair px-4 py-4 text-sm text-neutralx-700">{children}</div>}
    </section>
  );
}

export function Kopieer({ tekst, label = "Kopieer" }: { tekst: string; label?: string }) {
  const [klaar, setKlaar] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost !px-3 !py-1.5 text-xs"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(tekst);
          setKlaar(true);
          setTimeout(() => setKlaar(false), 2000);
        } catch {
          setKlaar(false);
        }
      }}
    >
      {klaar ? "Gekopieerd" : label}
    </button>
  );
}

/** Een waarde om in Play Console te plakken, met kopieerknop. */
export function Waarde({ label, waarde }: { label: string; waarde: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-full text-xs font-medium text-neutralx-500 sm:w-40">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-paper-soft px-2 py-1 text-xs text-ink">{waarde}</code>
      <Kopieer tekst={waarde} />
    </div>
  );
}

export function BevestigKnop({ label, vraag, onJa, bezig, uit, primair = true }: { label: string; vraag: string; onJa: () => void; bezig: boolean; uit?: boolean; primair?: boolean }) {
  const [zeker, setZeker] = useState(false);
  if (!zeker) {
    return (
      <button type="button" className={primair ? "btn-primary" : "btn-ghost"} disabled={bezig || uit} onClick={() => setZeker(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
      <p>{vraag}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={bezig}
          onClick={() => {
            setZeker(false);
            onJa();
          }}
        >
          Ja, doorgaan
        </button>
        <button type="button" className="btn-ghost" onClick={() => setZeker(false)}>
          Annuleren
        </button>
      </div>
    </div>
  );
}

export const tijdstip = (iso: string) =>
  new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
