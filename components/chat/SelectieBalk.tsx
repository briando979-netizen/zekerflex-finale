"use client";

import { useChatTeksten } from "./ChatTekstenContext";
import { IconClose, IconCopy, IconForward, IconStar, IconTrash } from "./icons";
import { vulIn } from "@/lib/i18n/vul-in";

// Meerdere berichten tegelijk (zoals WhatsApp, 13 nov 2026): de balk die in selectiemodus de plaats van de invoer
// inneemt. Alleen knoppen; wat ze doen staat in InboxPage. "Voor iedereen" alleen als alles van jou is en binnen 48 uur.

export function SelectieBalk({
  aantal,
  kanKopieren,
  kanDoorsturen,
  kanVoorIedereen,
  onKopieer,
  onBewaar,
  onDoorsturen,
  onVoorMij,
  onVoorIedereen,
  onStop,
}: {
  aantal: number;
  kanKopieren: boolean;
  kanDoorsturen: boolean;
  kanVoorIedereen: boolean;
  onKopieer: () => void;
  onBewaar: () => void;
  onDoorsturen: () => void;
  onVoorMij: () => void;
  onVoorIedereen: () => void;
  onStop: () => void;
}) {
  const ib = useChatTeksten().inbox;
  const knop = "grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-neutralx-600 hover:bg-black/5 disabled:opacity-40";
  return (
    <div className="flex items-center gap-1 border-t border-hair bg-[#F0F2F5] px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]" role="toolbar" aria-label={vulIn(ib.geselecteerdAantal, { aantal })}>
      <button type="button" onClick={onStop} className={knop} aria-label={ib.selStop} title={ib.selStop}>
        <IconClose className="h-5 w-5" />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" aria-live="polite">
        {vulIn(ib.geselecteerdAantal, { aantal })}
      </span>
      <button type="button" onClick={onKopieer} disabled={!kanKopieren} className={knop} aria-label={ib.selKopieer} title={ib.selKopieer}>
        <IconCopy className="h-5 w-5" />
      </button>
      <button type="button" onClick={onBewaar} className={knop} aria-label={ib.selBewaar} title={ib.selBewaar}>
        <IconStar className="h-5 w-5" />
      </button>
      <button type="button" onClick={onDoorsturen} disabled={!kanDoorsturen} className={knop} aria-label={ib.selDoorsturen} title={ib.selDoorsturen}>
        <IconForward className="h-5 w-5" />
      </button>
      <button type="button" onClick={onVoorMij} className={knop} aria-label={ib.selVoorMij} title={ib.selVoorMij}>
        <IconTrash className="h-5 w-5" />
      </button>
      {kanVoorIedereen && (
        <button type="button" onClick={onVoorIedereen} className="rounded-full px-3 py-2 text-xs font-semibold text-red-600 hover:bg-black/5">
          {ib.selVoorIedereen}
        </button>
      )}
    </div>
  );
}
