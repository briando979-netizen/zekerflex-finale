"use client";

import { useState } from "react";
import { useI18n } from "@/components/i18n/I18nProvider";
import { useFT } from "@/components/i18n/useFT";
import { OpleidingSheets } from "@/components/app/OpleidingSheets";
import { NIVEAU_LABELS, RICHTING_LABELS, type Opleiding } from "@/lib/onboarding/opleiding";

// De opleiding in het profiel (/dashboard/profiel). Sinds 13 nov 2026 niet meer in stap 1 van de onboarding
// (eigenaar: "veel te veel vragen"); optioneel en nooit een eis. Zelfde keuzeschermen als vroeger in stap 1
// (OpleidingSheets) en dezelfde teksten (useFT().wie). Na het bewaren telt de stand van de server.

export function OpleidingProfiel({
  begin,
  bewaar,
}: {
  begin: Opleiding | null;
  bewaar: (o: Opleiding | null) => Promise<{ ok: boolean; opleiding: Opleiding | null }>;
}) {
  const { locale } = useI18n();
  const w = useFT().wie;
  const p = w.persoon;
  const [opleiding, setOpleiding] = useState<Opleiding | null>(begin);
  const [open, setOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const tekst = opleiding
    ? [NIVEAU_LABELS[locale][opleiding.niveau], opleiding.richting ? RICHTING_LABELS[locale][opleiding.richting] : null].filter(Boolean).join(" · ")
    : "";

  async function kies(o: Opleiding | null) {
    const vorige = opleiding;
    setOpleiding(o);
    setFout(null);
    setBezig(true);
    try {
      const r = await bewaar(o);
      if (r.ok) setOpleiding(r.opleiding);
      else {
        setOpleiding(vorige);
        setFout(p.fout.algemeen);
      }
    } catch {
      setOpleiding(vorige);
      setFout(p.fout.offline);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="px-5 py-4">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={bezig}
        aria-haspopup="dialog"
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-hairstrong bg-white px-4 pb-2.5 pt-2 text-left focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100 disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="block text-xs font-medium text-neutralx-500">{p.opleiding}</span>
          <span className={`block min-h-[1.5rem] truncate text-base ${tekst ? "text-ink" : "text-neutralx-400"}`}>{bezig ? p.bezig : tekst || p.opleidingKies}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="flex-shrink-0 text-neutralx-400">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {fout && (
        <p role="alert" className="mt-1 px-1 text-xs font-medium text-crit">
          {fout}
        </p>
      )}
      <OpleidingSheets open={open} waarde={opleiding} locale={locale} teksten={w.opl} onKies={(o) => void kies(o)} onSluit={() => setOpen(false)} />
    </div>
  );
}
