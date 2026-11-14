"use client";

import { useState } from "react";
import { Portal } from "./Portal";
import { useChatTeksten } from "./ChatTekstenContext";
import { AFSPRAAK_PLEK_MAX, AFSPRAAK_TITEL_MAX } from "@/lib/messaging/afspraak";
import { amsterdamLocalInput } from "@/lib/time/amsterdam";

// Een afspraak maken in de chat (14 nov 2026): titel, begin in Nederlandse tijd (datetime-local), duur en plek. De server
// maakt er de afspraak van (lib/messaging/afspraak.ts maakAfspraak); hier alleen het formulier.

const DUREN = [30, 60, 90, 120, 180, 240, 480];

export function AfspraakMaker({ onSend, onCancel }: { onSend: (a: { titel: string; begin: string; duur: number; plek: string }) => void; onCancel: () => void }) {
  const t = useChatTeksten().composer;
  const volgendUur = new Date(Math.ceil((Date.now() + 1) / 3_600_000) * 3_600_000);
  const [titel, setTitel] = useState("");
  const [begin, setBegin] = useState(() => amsterdamLocalInput(volgendUur));
  const [duur, setDuur] = useState(60);
  const [plek, setPlek] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const duurTekst = (m: number) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)}½ u` : `${m / 60} u`);

  return (
    <Portal>
      <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/60 sm:items-center" onClick={onCancel}>
        <form
          role="dialog"
          aria-modal="true"
          aria-label={t.afspraakMaken}
          className="chat-surface w-full rounded-t-2xl bg-white p-4 shadow-lift sm:max-w-sm sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            if (!titel.trim()) {
              setFout(t.afspraakTitelNodig);
              return;
            }
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(begin)) {
              setFout(t.afspraakTijdNodig);
              return;
            }
            onSend({ titel: titel.trim(), begin, duur, plek: plek.trim() });
          }}
        >
          <p className="mb-3 font-display text-sm font-bold text-ink">{t.afspraakMaken}</p>
          <label className="block">
            <span className="field-label">{t.afspraakTitel}</span>
            <input value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={AFSPRAAK_TITEL_MAX} placeholder={t.afspraakTitelVoorbeeld} className="field-input mt-1 w-full" autoFocus />
          </label>
          <div className="mt-2 flex gap-2">
            <label className="block flex-1">
              <span className="field-label">{t.afspraakBegin}</span>
              <input type="datetime-local" value={begin} onChange={(e) => setBegin(e.target.value)} className="field-input mt-1 w-full" />
            </label>
            <label className="block w-24">
              <span className="field-label">{t.afspraakDuur}</span>
              <select value={duur} onChange={(e) => setDuur(Number(e.target.value))} className="field-input mt-1 w-full">
                {DUREN.map((m) => (
                  <option key={m} value={m}>
                    {duurTekst(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-2 block">
            <span className="field-label">{t.afspraakPlek}</span>
            <input value={plek} onChange={(e) => setPlek(e.target.value)} maxLength={AFSPRAAK_PLEK_MAX} placeholder={t.afspraakPlekVoorbeeld} className="field-input mt-1 w-full" />
          </label>
          {fout && (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-crit">
              {fout}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="submit" className="btn-primary flex-1 text-sm">
              {t.afspraakVersturen}
            </button>
            <button type="button" onClick={onCancel} className="rounded-lg px-3 text-sm text-neutralx-500 hover:bg-paper-soft">
              {t.annuleren}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
