"use client";

import { Portal } from "./Portal";
import { useChatTeksten } from "./ChatTekstenContext";
import { LIVE_DUREN, type LiveDuur } from "@/lib/messaging/live-locatie";

// Locatie delen (15 nov 2026), zoals in WhatsApp: één keer je plek van nu, of live voor 15 minuten, een uur of acht uur.
// Hier alleen de keuze; de plek bepalen en versturen doet de Composer.

export function LocatieKiezer({ onKies, onCancel }: { onKies: (live: LiveDuur | null) => void; onCancel: () => void }) {
  const t = useChatTeksten().composer;
  const duur: Record<LiveDuur, string> = { 15: t.liveDuur15, 60: t.liveDuur60, 480: t.liveDuur480 };
  return (
    <Portal>
      <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/60 sm:items-center" onClick={onCancel}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.menuLocatie}
          className="chat-surface w-full rounded-t-2xl bg-white p-4 shadow-lift sm:max-w-sm sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-3 font-display text-sm font-bold text-ink">{t.menuLocatie}</p>
          <button type="button" onClick={() => onKies(null)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-paper-soft">
            <span aria-hidden className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-brand-500 text-white">
              📍
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{t.locatieNu}</span>
              <span className="block text-xs text-neutralx-500">{t.locatieNuUitleg}</span>
            </span>
          </button>
          <div className="mt-1 rounded-xl px-3 py-2.5">
            <div className="flex items-center gap-3">
              <span aria-hidden className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-brand-500 text-white">
                📡
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{t.locatieLive}</span>
                <span className="block text-xs text-neutralx-500">{t.locatieLiveUitleg}</span>
              </span>
            </div>
            <div className="mt-2 flex gap-1.5 pl-12" role="group" aria-label={t.locatieLive}>
              {LIVE_DUREN.map((m) => (
                <button key={m} type="button" onClick={() => onKies(m)} className="rounded-full border border-hair px-3 py-1 text-xs font-semibold text-ink hover:bg-paper-soft">
                  {duur[m]}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={onCancel} className="mt-2 w-full rounded-lg px-3 py-2 text-sm text-neutralx-500 hover:bg-paper-soft">
            {t.annuleren}
          </button>
        </div>
      </div>
    </Portal>
  );
}
