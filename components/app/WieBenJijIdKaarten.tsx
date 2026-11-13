"use client";

import type { WieTeksten } from "@/lib/i18n/wie-ben-jij";
import type { ScanRoute, ScanWijze } from "@/components/app/IdScan";
import type { ReactNode } from "react";

// Stap "ID-check": het tipkader en twee keuzes, elk met dezelfde live camera (13 nov 2026, eigenaar: "of je kiest
// handmatig, of je laat het automatisch doen"; geen bestandskeuze meer):
//  1. Automatisch: de camera maakt de foto vanzelf zodra alles goed is; er is geen knop.
//  2. Zelf de foto maken: dezelfde scan met aanwijzingen, maar je drukt zelf op de knop.
// Beide met een Nederlands of buitenlands document (elk een eigen route) en dezelfde controle
// (lib/onboarding/auto-redenen.ts). Stripe staat als klein linkje onder de keuzes zolang het werkt (`stripe`).
// Alleen weergave.

const KNOP_OMRAND =
  "w-full rounded-xl border-2 border-brand-600 px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60";

export function IdKeuzeKaarten({
  w,
  busy,
  onStart,
  stripe = null,
}: {
  w: WieTeksten["id"];
  busy: boolean;
  onStart: (route: ScanRoute, wijze: ScanWijze) => void;
  /** een klein linkje naar Stripe Identity, alleen als dat werkt */
  stripe?: ReactNode;
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
        <h3 id="id-keuze-auto" className="mt-2 font-display text-base font-bold text-ink">{w.autoTitel}</h3>
        <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{w.autoUitleg}</p>
        <p className="mt-2 flex items-center gap-2 text-sm text-ink">
          <span aria-hidden className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" />
          {w.nlPunt}
        </p>
        <div className="mt-4 grid gap-2" role="group" aria-labelledby="id-keuze-auto">
          <button type="button" data-track="id-start-nl-auto" onClick={() => onStart("nl", "auto")} disabled={busy} className="btn-primary w-full disabled:opacity-60">
            {w.nlKnop}
          </button>
          <button type="button" data-track="id-start-eu-auto" onClick={() => onStart("eu", "auto")} disabled={busy} className={KNOP_OMRAND}>
            {w.euKnop}
          </button>
        </div>
      </div>

      {/* keuze 2: dezelfde scan, maar zelf op de knop drukken */}
      <div className="rounded-2xl border border-hairstrong bg-white p-4">
        <span className="inline-block rounded-full bg-paper-soft px-2.5 py-0.5 text-xs font-semibold text-ink-soft">{w.zelfEtiket}</span>
        <h3 id="id-keuze-zelf" className="mt-2 font-display text-base font-bold text-ink">{w.zelfTitel}</h3>
        <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{w.zelfUitleg}</p>
        <div className="mt-4 grid gap-2" role="group" aria-labelledby="id-keuze-zelf">
          <button type="button" data-track="id-start-nl-zelf" onClick={() => onStart("nl", "zelf")} disabled={busy} className={KNOP_OMRAND}>
            {w.nlKnop}
          </button>
          <button type="button" data-track="id-start-eu-zelf" onClick={() => onStart("eu", "zelf")} disabled={busy} className={KNOP_OMRAND}>
            {w.euKnop}
          </button>
        </div>
      </div>

      {stripe && <p className="text-center">{stripe}</p>}
      <p className="text-center text-sm">
        <a href="mailto:support@zekerflex.com" className="font-semibold text-brand-600 underline underline-offset-4">
          {w.hulp}
        </a>
      </p>
    </div>
  );
}
