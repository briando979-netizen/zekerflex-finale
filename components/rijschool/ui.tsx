"use client";

import type { ReactNode } from "react";
import { STATUS_LABEL } from "@/lib/rijschool/format";

// Kleine bouwstenen die het beheer, de leerling-app en de instructeur-app delen.

export function Melding({ fout, ok }: { fout?: string | null; ok?: string | null }) {
  if (fout) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-crit">
        {fout}
      </p>
    );
  }
  if (ok) {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-ok">
        {ok}
      </p>
    );
  }
  return null;
}

export function Veld({ label, children, uitleg }: { label: string; children: ReactNode; uitleg?: string }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {uitleg && <span className="mt-1 block text-xs text-neutralx-500">{uitleg}</span>}
    </label>
  );
}

export function Schakelaar({ label, aan, onChange, uitleg }: { label: string; aan: boolean; onChange: (aan: boolean) => void; uitleg?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-hair bg-white px-3 py-2.5">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-600" checked={aan} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {uitleg && <span className="block text-xs text-neutralx-500">{uitleg}</span>}
      </span>
    </label>
  );
}

export function Tabs<T extends string>({ tabs, actief, onKies, label }: { tabs: { id: T; label: string }[]; actief: T; onKies: (t: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === actief}
          onClick={() => onKies(t.id)}
          className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${
            t.id === actief ? "bg-ink text-white" : "bg-white text-neutralx-600 ring-1 ring-hair hover:text-ink"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_STIJL: Record<string, string> = {
  GEPLAND: "pill-neutral",
  VOLTOOID: "pill-ok",
  GEANNULEERD: "pill-warn",
  NIET_VERSCHENEN: "pill-crit",
};

export function LesStatus({ status }: { status: string }) {
  return <span className={STATUS_STIJL[status] ?? "pill-neutral"}>{STATUS_LABEL[status] ?? status}</span>;
}

export function Voortgangsbalk({ procent, kleur, label }: { procent: number; kleur?: string; label: string }) {
  const p = Math.max(0, Math.min(100, Math.round(procent)));
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} className="h-2.5 w-full overflow-hidden rounded-full bg-paper-soft">
      <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, background: kleur ?? "#0E5C4A" }} />
    </div>
  );
}

/** Score 1–5 als vijf bolletjes. */
export function ScoreBolletjes({ score, kleur }: { score: number; kleur: string }) {
  return (
    <span className="inline-flex gap-1" aria-label={`Score ${score} van 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="h-2.5 w-2.5 rounded-full" style={{ background: n <= score ? kleur : "#E6E7E1" }} />
      ))}
    </span>
  );
}
