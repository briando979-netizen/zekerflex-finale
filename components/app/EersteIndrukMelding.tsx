"use client";

import { useState } from "react";

/** Korte, sluitbare melding bovenaan de klussen (na "Opslaan" in /dashboard/eerste-indruk). */
export function EersteIndrukMelding({ tekst, sluiten, goed }: { tekst: string; sluiten: string; goed: boolean }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <div role="status" className="card relative mb-5 flex items-start gap-3 p-4 pr-12">
      <span aria-hidden className="text-2xl leading-none">{goed ? "🎉" : "ℹ️"}</span>
      <p className="text-sm font-medium text-ink">{tekst}</p>
      <button type="button" onClick={() => setOpen(false)} aria-label={sluiten} className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full text-neutralx-500 hover:bg-neutralx-100">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
