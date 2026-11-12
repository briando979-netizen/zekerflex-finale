"use client";

import { useState, type ReactNode } from "react";
import { useDialog } from "@/components/app/useDialog";
import type { ScanExtra } from "@/lib/i18n/scan-extra";

// ---------------------------------------------------------------------------
// De openingsschermen van de twee routes van de ID-scan (components/app/IdScan.tsx):
//  - Nederlands ID: een licht introscherm met een illustratie;
//  - buitenlands ID: introscherm, toestemming met vinkje en de tips-sheet.
// Alleen weergave en kleine eigen staat; de scanlogica blijft in IdScan.
// ---------------------------------------------------------------------------

/** Eigen illustratie (alleen vormen): een persoon met een telefoon en een schild met een vinkje. */
export function PersoonBeeld() {
  return (
    <svg width="168" height="168" viewBox="0 0 168 168" fill="none" aria-hidden className="mx-auto">
      <circle cx="84" cy="84" r="80" className="fill-brand-50" />
      <circle cx="62" cy="60" r="15" fill="#0B3B3A" />
      <path d="M34 128c0-18 12-30 28-30s28 12 28 30" fill="#0E8F6B" />
      <rect x="86" y="68" width="30" height="52" rx="6" fill="#0B3B3A" />
      <rect x="90" y="75" width="22" height="34" rx="2" fill="#ffffff" />
      <circle cx="101" cy="114" r="2" fill="#ffffff" fillOpacity="0.6" />
      <path d="M126 34l22 8v18c0 14-9 24-22 30-13-6-22-16-22-30V42l22-8z" fill="#4FE0A0" />
      <path d="M117 58l7 7 12-13" stroke="#0B3B3A" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="30" cy="40" r="4" fill="#4FE0A0" />
      <circle cx="144" cy="118" r="5" fill="#0E8F6B" fillOpacity="0.45" />
    </svg>
  );
}

function PrivacyLink({ tekst }: { tekst: string }) {
  return (
    <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-brand-600 underline">
      {tekst}
    </a>
  );
}

/** Route 1: licht introscherm, donkere hoofdknop. */
export function NlIntro({ x, privacy, annuleren, onStart, onAnnuleer, extra }: { x: ScanExtra; privacy: string; annuleren: string; onStart: () => void; onAnnuleer: () => void; extra?: ReactNode }) {
  return (
    <div className="text-center">
      <PersoonBeeld />
      <h2 className="mt-5 font-display text-2xl font-bold text-ink">{x.introTitel}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{x.introTekst}</p>
      {extra}
      <button
        type="button"
        onClick={onStart}
        className="mt-6 w-full rounded-xl bg-ink px-5 py-3.5 text-sm font-semibold text-white hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
      >
        {x.beginnen}
      </button>
      <button type="button" onClick={onAnnuleer} className="btn-ghost mt-2 w-full">
        {annuleren}
      </button>
      <p className="mt-5 text-xs leading-relaxed text-neutralx-500">
        {x.privacyRegel} <PrivacyLink tekst={privacy} />
      </p>
    </div>
  );
}

/** Route 2, scherm 1: online identificatie. */
export function EuIntro({ x, onStart, onAnnuleer, annuleren, extra }: { x: ScanExtra; onStart: () => void; onAnnuleer: () => void; annuleren: string; extra?: ReactNode }) {
  return (
    <div className="text-center">
      <PersoonBeeld />
      <h2 className="mt-5 font-display text-2xl font-bold text-ink">{x.euIntroTitel}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{x.euIntroTekst}</p>
      <p className="mx-auto mt-4 inline-block rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">{x.euIntroLabel}</p>
      {extra}
      <button type="button" onClick={onStart} className="btn-primary mt-6 w-full">
        {x.euStart}
      </button>
      <button type="button" onClick={onAnnuleer} className="btn-ghost mt-2 w-full">
        {annuleren}
      </button>
      <p className="mt-5 text-xs text-neutralx-500">{x.euBewaard}</p>
    </div>
  );
}

function Pictogram({ n }: { n: number }) {
  const pad =
    n === 0
      ? "M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-4 3.6-6 8-6s8 2 8 6"
      : n === 1
        ? "M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M9 10h.01M15 10h.01M9 15c1.5 1.3 4.5 1.3 6 0"
        : "M4 6h16v12H4zM8 11h5M8 14h8M16 10h.01";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden className="flex-shrink-0 text-brand-600">
      <path d={pad} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Route 2, scherm 2: toestemming; "Akkoord en verder" pas met het vinkje. */
export function EuToestemming({ x, privacy, onAkkoord }: { x: ScanExtra; privacy: string; onAkkoord: () => void }) {
  const [vink, setVink] = useState(false);
  return (
    <div>
      <h2 className="font-display text-2xl font-bold text-ink">{x.tmKop}</h2>
      <p className="mt-2 inline-block rounded-full bg-ok/10 px-3 py-1 text-xs font-semibold text-ok">{x.tmLabel}</p>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        {x.tmUitleg} <PrivacyLink tekst={privacy} />
      </p>
      <ul className="mt-4 space-y-3 rounded-xl border border-hair bg-paper-soft px-4 py-4">
        {x.tmLijst.map((l, i) => (
          <li key={l} className="flex items-center gap-3 text-sm text-ink">
            <Pictogram n={i} />
            {l}
          </li>
        ))}
      </ul>
      <label className="mt-5 flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-ink">
        <input type="checkbox" checked={vink} onChange={(e) => setVink(e.target.checked)} className="mt-1 h-5 w-5 flex-shrink-0 accent-brand-600" />
        <span>{x.tmVink}</span>
      </label>
      <button type="button" disabled={!vink} onClick={onAkkoord} className="btn-primary mt-5 w-full disabled:opacity-50">
        {x.tmKnop}
      </button>
    </div>
  );
}

/** Route 2, scherm 3: tips en trucs in een onderste sheet, met de uitleg over de cameratoegang. */
export function TipsSheet({ x, onSluit }: { x: ScanExtra; onSluit: () => void }) {
  const ref = useDialog(true, onSluit);
  return (
    <div className="fixed inset-0 z-10 flex items-end justify-center bg-ink/50" onClick={onSluit}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-tips-titel"
        onClick={(e) => e.stopPropagation()}
        className="max-h-full w-full overflow-y-auto rounded-t-2xl bg-white px-5 pb-6 pt-5 shadow-lift"
      >
        <h2 id="scan-tips-titel" className="font-display text-xl font-bold text-ink">{x.tipsSheetKop}</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{x.tipsCamera}</p>
        <ul className="mt-4 space-y-2.5">
          {x.tips.map((tip) => (
            <li key={tip} className="flex gap-3 text-sm leading-relaxed text-ink">
              <span aria-hidden className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-ok text-[11px] text-white">✓</span>
              {tip}
            </li>
          ))}
        </ul>
        <button type="button" onClick={onSluit} className="btn-primary mt-6 w-full">
          {x.tipsKnop}
        </button>
      </div>
    </div>
  );
}
