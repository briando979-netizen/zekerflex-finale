"use client";

import { useEffect, useState } from "react";
import { maakPeiling, POLL_MAX_OPTIONS, POLL_MIN_OPTIONS, POLL_OPTION_MAX, POLL_QUESTION_MAX } from "@/lib/messaging/poll";
import { Portal } from "./Portal";
import { IconClose, IconSend } from "./icons";

/**
 * Een peiling maken ("Wie kan zaterdag de late dienst?"): vraag, keuzes en of
 * iemand meer dan één keuze mag aantikken. Een nieuw leeg veld verschijnt zodra
 * het laatste is ingevuld.
 */
export function PollMaker({
  onSend,
  onCancel,
}: {
  onSend: (poll: { question: string; options: string[]; multi: boolean }) => void;
  onCancel: () => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multi, setMulti] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const zetKeuze = (i: number, waarde: string) => {
    setFout(null);
    setOptions((prev) => {
      const next = prev.map((o, j) => (j === i ? waarde : o));
      // altijd één leeg veld onderaan, tot het maximum
      if (next.length < POLL_MAX_OPTIONS && (next[next.length - 1] ?? "").trim()) next.push("");
      return next;
    });
  };

  const verstuur = () => {
    const p = maakPeiling(question, options, multi);
    if (!p) {
      setFout(
        question.trim()
          ? `Vul minstens ${POLL_MIN_OPTIONS} verschillende keuzes in.`
          : "Vul eerst een vraag in.",
      );
      return;
    }
    onSend({ question: p.question, options: p.poll.options.map((o) => o.text), multi });
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/60 sm:items-center" onClick={onCancel}>
        <form
          role="dialog"
          aria-modal="true"
          aria-labelledby="peiling-titel"
          className="chat-surface flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-lift sm:max-w-md sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
          onSubmit={(e) => {
            e.preventDefault();
            verstuur();
          }}
        >
          <div className="flex items-center gap-2 border-b border-hair px-4 py-3">
            <p id="peiling-titel" className="font-display text-sm font-bold text-ink">
              📊 Peiling maken
            </p>
            <button type="button" onClick={onCancel} className="ml-auto grid h-8 w-8 place-items-center rounded-full text-neutralx-500 hover:bg-paper-soft" aria-label="Annuleren">
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <div>
              <label htmlFor="peiling-vraag" className="mb-1 block text-xs font-semibold text-neutralx-600">
                Vraag
              </label>
              <input
                id="peiling-vraag"
                autoFocus
                value={question}
                maxLength={POLL_QUESTION_MAX}
                onChange={(e) => {
                  setFout(null);
                  setQuestion(e.target.value);
                }}
                placeholder="Bijv. wie kan zaterdag de late dienst?"
                className="w-full rounded-lg border border-hairstrong px-3 py-2 text-base outline-none focus:border-[#008069] md:text-sm"
              />
            </div>
            <fieldset>
              <legend className="mb-1 block text-xs font-semibold text-neutralx-600">Keuzes</legend>
              <div className="space-y-1.5">
                {options.map((o, i) => (
                  <input
                    key={i}
                    value={o}
                    maxLength={POLL_OPTION_MAX}
                    onChange={(e) => zetKeuze(i, e.target.value)}
                    placeholder={`Keuze ${i + 1}`}
                    aria-label={`Keuze ${i + 1}`}
                    className="w-full rounded-lg border border-hairstrong px-3 py-2 text-base outline-none focus:border-[#008069] md:text-sm"
                  />
                ))}
              </div>
              <p className="mt-1 text-[11px] text-neutralx-500">Hooguit {POLL_MAX_OPTIONS} keuzes; lege velden tellen niet mee.</p>
            </fieldset>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="h-4 w-4 accent-[#008069]" />
              Meer dan één keuze per persoon toestaan
            </label>
            {fout && (
              <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2 text-sm text-crit">
                {fout}
              </p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-hair bg-[#F0F2F5] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm font-medium text-neutralx-600 hover:bg-black/5">
              Annuleren
            </button>
            <button type="submit" className="flex items-center gap-1.5 rounded-full bg-[#008069] px-4 py-2 text-sm font-semibold text-white">
              <IconSend className="h-4 w-4" />
              Versturen
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
