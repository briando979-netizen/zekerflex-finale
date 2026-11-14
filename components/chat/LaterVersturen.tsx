"use client";

import { useState } from "react";
import { Portal } from "./Portal";
import { useChatTeksten } from "./ChatTekstenContext";
import { amsterdamLocalInput } from "@/lib/time/amsterdam";
import { geplandeTijd, GEPLAND_MAX_DAGEN } from "@/lib/messaging/gepland-tijd";
import { vulIn } from "@/lib/i18n/vul-in";

// Later versturen (15 nov 2026): het bericht dat je typte, en wanneer (Nederlandse tijd, datetime-local). De server plant
// het in (lib/messaging/gepland.ts) en de cron verstuurt het op tijd, ook als ZekerFlex dan dicht is.

export function LaterVersturen({ tekst, onPlan, onCancel }: { tekst: string; onPlan: (text: string, wanneer: string) => Promise<string | null>; onCancel: () => void }) {
  const t = useChatTeksten().composer;
  const volgendUur = new Date(Math.ceil((Date.now() + 1) / 3_600_000) * 3_600_000);
  const [text, setText] = useState(tekst);
  const [wanneer, setWanneer] = useState(() => amsterdamLocalInput(volgendUur));
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  return (
    <Portal>
      <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/60 sm:items-center" onClick={onCancel}>
        <form
          role="dialog"
          aria-modal="true"
          aria-label={t.laterTitel}
          className="chat-surface w-full rounded-t-2xl bg-white p-4 shadow-lift sm:max-w-sm sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) {
              setFout(t.laterTekstNodig);
              return;
            }
            if (!geplandeTijd(wanneer)) {
              setFout(vulIn(t.laterTijdNodig, { dagen: String(GEPLAND_MAX_DAGEN) }));
              return;
            }
            setBezig(true);
            void onPlan(text.trim(), wanneer).then((probleem) => {
              setBezig(false);
              if (probleem) setFout(probleem);
            });
          }}
        >
          <p className="mb-3 font-display text-sm font-bold text-ink">{t.laterTitel}</p>
          <label className="block">
            <span className="field-label">{t.laterBericht}</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="field-input mt-1 w-full resize-none" autoFocus />
          </label>
          <label className="mt-2 block">
            <span className="field-label">{t.laterWanneer}</span>
            <input type="datetime-local" value={wanneer} onChange={(e) => setWanneer(e.target.value)} className="field-input mt-1 w-full" />
          </label>
          <p className="mt-1 text-[11px] text-neutralx-500">{t.laterUitleg}</p>
          {fout && (
            <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-crit">
              {fout}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={bezig} className="btn-primary flex-1 text-sm disabled:opacity-60">
              {t.laterPlannen}
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
