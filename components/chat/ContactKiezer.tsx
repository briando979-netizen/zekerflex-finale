"use client";

import { useMemo, useState } from "react";
import { Portal } from "./Portal";
import { useChatTeksten } from "./ChatTekstenContext";
import type { Kandidaat } from "@/lib/messaging/rondzenden";

// Een contact delen als kaartje (zoals WhatsApp, 14 nov 2026): kies iemand met wie je zelf in contact staat. De server
// controleert dat opnieuw en zet de naam erbij (app/api/inbox/[threadId]/route.ts).

export function ContactKiezer({ kandidaten, onKies, onCancel }: { kandidaten: Kandidaat[]; onKies: (k: Kandidaat) => void; onCancel: () => void }) {
  const t = useChatTeksten().composer;
  const [zoek, setZoek] = useState("");
  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLocaleLowerCase("nl-NL");
    return q ? kandidaten.filter((k) => k.name.toLocaleLowerCase("nl-NL").includes(q)) : kandidaten;
  }, [kandidaten, zoek]);
  return (
    <Portal>
      <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/60 sm:items-center" onClick={onCancel}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.contactKiezen}
          className="chat-surface flex max-h-[80vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift sm:max-w-sm sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
            <p className="font-display text-sm font-bold text-ink">{t.contactKiezen}</p>
            <button type="button" onClick={onCancel} className="ml-auto rounded-lg px-2 py-1 text-sm text-neutralx-500 hover:bg-paper-soft">
              {t.annuleren}
            </button>
          </div>
          {kandidaten.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-neutralx-500">{t.contactGeen}</p>
          ) : (
            <>
              <div className="p-3">
                <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder={t.contactZoek} aria-label={t.contactZoek} className="field-input w-full" autoFocus />
              </div>
              <ul className="min-h-0 flex-1 overflow-y-auto pb-2">
                {zichtbaar.map((k) => (
                  <li key={k.userId}>
                    <button type="button" onClick={() => onKies(k)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-ink hover:bg-paper-soft">
                      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-bold text-white" aria-hidden>
                        {k.name.slice(0, 1).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{k.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}
