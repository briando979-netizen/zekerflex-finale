"use client";

import type { ReactNode } from "react";
import type { WieTeksten } from "@/lib/i18n/wie-ben-jij";
import type { ScanRoute } from "@/components/app/IdScan";

// Stap "ID-check": het tipkader en twee keuzes (12 nov 2026, eigenaar: "laat gebruikers twee opties doen: auto of
// handmatig foto maken"). Beide worden automatisch gecontroleerd met dezelfde regels (lib/onboarding/auto-redenen.ts):
//  1. Automatisch: de eigen ID-scan van ZekerFlex met de camera (Nederlands of buitenlands document, elk een eigen route).
//  2. Zelf foto's maken: het formulier met de foto's (`zelf`), ook met de selfie met een gedraaid hoofd.
// Stripe staat hier niet meer bij (het live account weigert Identity en het kost per controle geld). Alleen weergave.

const KNOP_OMRAND =
  "w-full rounded-xl border-2 border-brand-600 px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60";

export function IdKeuzeKaarten({
  w,
  busy,
  onStart,
  zelfOpen,
  onZelf,
  zelf,
}: {
  w: WieTeksten["id"];
  busy: boolean;
  onStart: (route: ScanRoute) => void;
  /** is het formulier "zelf foto's maken" open? */
  zelfOpen: boolean;
  onZelf: () => void;
  /** het formulier met de foto's, als het open is */
  zelf: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div role="note" className="rounded-2xl border border-ok/30 bg-ok/5 px-4 py-3">
        <p className="text-sm font-semibold text-ink">{w.tipKop}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-soft">
          <li>{w.tip1}</li>
          <li>{w.tip2}</li>
          <li>{w.tip3}</li>
        </ul>
      </div>

      {/* keuze 1: automatisch met de camera */}
      <div className="rounded-2xl border-2 border-brand-600 bg-white p-4">
        <span className="inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{w.autoEtiket}</span>
        <h3 className="mt-2 font-display text-base font-bold text-ink">{w.autoTitel}</h3>
        <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{w.autoUitleg}</p>
        <p className="mt-2 flex items-center gap-2 text-sm text-ink">
          <span aria-hidden className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" />
          {w.nlPunt}
        </p>
        <div className="mt-4 grid gap-2">
          <button type="button" onClick={() => onStart("nl")} disabled={busy} className="btn-primary w-full disabled:opacity-60">
            {w.nlKnop}
          </button>
          <button type="button" onClick={() => onStart("eu")} disabled={busy} className={KNOP_OMRAND}>
            {w.euKnop}
          </button>
        </div>
      </div>

      {/* keuze 2: zelf de foto's maken (camera of galerij) */}
      <div className="rounded-2xl border border-hairstrong bg-white p-4">
        <span className="inline-block rounded-full bg-paper-soft px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{w.zelfEtiket}</span>
        <h3 className="mt-2 font-display text-base font-bold text-ink">{w.zelfTitel}</h3>
        <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{w.zelfUitleg}</p>
        <button type="button" onClick={onZelf} aria-expanded={zelfOpen} className={`mt-4 ${KNOP_OMRAND}`}>
          {w.zelfKnop}
        </button>
        {zelf}
      </div>

      <p className="text-center text-sm">
        <a href="mailto:support@zekerflex.com" className="font-semibold text-brand-600 underline underline-offset-4">
          {w.hulp}
        </a>
      </p>
    </div>
  );
}
