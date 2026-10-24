"use client";

import { useState, type ReactNode } from "react";

// Archief van afgeronde/gewerkte diensten: standaard ingeklapt, pas zichtbaar
// wanneer de werkgever het archief opent — houdt het dashboard overzichtelijk.
export function CollapsibleArchive({ count, label, children }: { count: number; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl border border-hair bg-paper-soft px-4 py-3 text-left text-sm font-semibold text-neutralx-700 transition hover:border-brand-300"
      >
        <span>📁 {label} ({count})</span>
        <span className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>▾</span>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}
