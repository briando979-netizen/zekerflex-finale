"use client";

import { useState } from "react";
import { aantalStemmers, mijnKeuze, tikKeuze, uitslag, type MessagePoll } from "@/lib/messaging/poll";

/** Zoveel namen per keuze; daarna "+n". */
const NAMEN_MAX = 3;

/**
 * Een peiling in een chatbubbel: de vraag, de keuzes met balk en aantal, en wie
 * waarop stemde. Tik op een keuze = stemmen (nog eens tikken = intrekken). De
 * maker kan hem sluiten; daarna staat de uitslag vast.
 */
export function PollCard({
  question,
  poll,
  mine,
  myUserId,
  names,
  disabled,
  onVote,
  onClose,
}: {
  question: string;
  poll: MessagePoll | undefined;
  mine: boolean;
  myUserId?: string;
  /** userId → naam van wie in het gesprek zit */
  names?: Record<string, string>;
  /** nog niet verstuurd of mislukt: nog niet stemmen */
  disabled?: boolean;
  onVote?: (optionIds: string[]) => void;
  onClose?: () => void;
}) {
  const [zeker, setZeker] = useState(false);
  if (!poll) {
    return <p className="mt-0.5 font-semibold text-ink">📊 {question}</p>;
  }
  const gesloten = Boolean(poll.closedAt);
  const kanStemmen = !gesloten && !disabled && Boolean(onVote) && Boolean(myUserId);
  const mijn = mijnKeuze(poll, myUserId);
  const totaal = aantalStemmers(poll);
  const naam = (uid: string) => (uid === myUserId ? "Jij" : (names?.[uid] ?? "Iemand"));

  return (
    <div className="min-w-[14rem] max-w-[20rem]" role="group" aria-label={`Peiling: ${question}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutralx-500">📊 Peiling</p>
      <p className="mt-0.5 break-words font-semibold text-ink">{question}</p>
      <p className="mb-1.5 text-[11px] text-neutralx-500">
        {gesloten ? "Gesloten · de uitslag staat vast" : poll.multi ? "Kies één of meer" : "Kies één"}
      </p>
      <ul className="space-y-1.5">
        {uitslag(poll).map((o) => {
          const gekozen = mijn.includes(o.id);
          const zichtbaar = o.stemmers.slice(0, NAMEN_MAX).map(naam);
          const rest = o.stemmers.length - zichtbaar.length;
          return (
            <li key={o.id}>
              <button
                type="button"
                disabled={!kanStemmen}
                aria-pressed={gekozen}
                onClick={() => {
                  if (kanStemmen && myUserId) onVote?.(tikKeuze(poll, myUserId, o.id));
                }}
                className="relative block w-full overflow-hidden rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5 text-left enabled:hover:bg-white disabled:cursor-default"
              >
                <span
                  className={`absolute inset-y-0 left-0 ${o.koploper && gesloten ? "bg-[#008069]/25" : "bg-[#008069]/15"}`}
                  style={{ width: `${o.procent}%` }}
                  aria-hidden
                />
                <span className="relative flex items-center gap-2">
                  <span
                    className={`grid h-4 w-4 flex-shrink-0 place-items-center border text-[10px] leading-none ${poll.multi ? "rounded" : "rounded-full"} ${
                      gekozen ? "border-[#008069] bg-[#008069] text-white" : "border-neutralx-400 bg-white"
                    }`}
                    aria-hidden
                  >
                    {gekozen ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1 break-words text-sm text-ink">{o.text}</span>
                  <span className="text-xs font-semibold tabular-nums text-neutralx-600">{o.stemmen}</span>
                </span>
                {o.stemmen > 0 && (
                  <span className="relative mt-0.5 block truncate pl-6 text-[11px] text-neutralx-500">
                    {zichtbaar.join(", ")}
                    {rest > 0 ? ` +${rest}` : ""}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-neutralx-500">
        <span>{totaal === 1 ? "1 persoon stemde" : `${totaal} mensen stemden`}</span>
        {mine && !gesloten && onClose && !disabled && (
          <span className="ml-auto flex items-center gap-1.5">
            {zeker ? (
              <>
                <button type="button" onClick={() => onClose()} className="rounded-full bg-[#008069] px-2 py-0.5 font-semibold text-white">
                  Ja, sluiten
                </button>
                <button type="button" onClick={() => setZeker(false)} className="rounded-full px-1.5 py-0.5 font-medium text-neutralx-600 hover:bg-black/5">
                  Nee
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setZeker(true)} className="rounded-full px-1.5 py-0.5 font-medium text-[#008069] hover:bg-black/5">
                Peiling sluiten
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
