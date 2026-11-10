"use client";

import type { ReactNode } from "react";
import type { WieTeksten } from "@/lib/i18n/wie-ben-jij";
import type { ScanRoute } from "@/components/app/IdScan";

// Stap "ID-check": het tipkader en de twee keuzekaarten (Nederlandse identiteit, buitenlands paspoort
// of ID-kaart). Beide starten de eigen ID-scan van ZekerFlex met hun eigen route; de andere manieren
// (Stripe, zelf foto's uploaden) staan eronder als `anders`. Alleen weergave.

function Kaart({
  etiket,
  titel,
  uitleg,
  punt,
  knop,
  vol,
  disabled,
  onStart,
}: {
  etiket: string;
  titel: string;
  uitleg: string;
  punt: string;
  knop: string;
  /** gekleurde hoofdknop, anders een omrande knop */
  vol: boolean;
  disabled: boolean;
  onStart: () => void;
}) {
  return (
    <div className="rounded-2xl border border-hairstrong bg-white p-4">
      <span className="inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{etiket}</span>
      <h3 className="mt-2 font-display text-base font-bold text-ink">{titel}</h3>
      <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{uitleg}</p>
      <p className="mt-2 flex items-center gap-2 text-sm text-ink">
        <span aria-hidden className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-500" />
        {punt}
      </p>
      <button
        type="button"
        onClick={onStart}
        disabled={disabled}
        className={
          vol
            ? "btn-primary mt-4 w-full disabled:opacity-60"
            : "mt-4 w-full rounded-xl border-2 border-brand-600 px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-60"
        }
      >
        {knop}
      </button>
    </div>
  );
}

export function IdKeuzeKaarten({ w, busy, onStart, anders }: { w: WieTeksten["id"]; busy: boolean; onStart: (route: ScanRoute) => void; anders: ReactNode }) {
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
      <Kaart etiket={w.nlEtiket} titel={w.nlTitel} uitleg={w.nlUitleg} punt={w.nlPunt} knop={w.nlKnop} vol disabled={busy} onStart={() => onStart("nl")} />
      <Kaart etiket={w.euEtiket} titel={w.euTitel} uitleg={w.euUitleg} punt={w.euPunt} knop={w.euKnop} vol={false} disabled={busy} onStart={() => onStart("eu")} />
      {anders}
      <p className="text-center text-sm">
        <a href="mailto:support@zekerflex.com" className="font-semibold text-brand-600 underline underline-offset-4">
          {w.hulp}
        </a>
      </p>
    </div>
  );
}
