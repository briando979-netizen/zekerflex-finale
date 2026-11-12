"use client";

import { useEffect, type ReactNode } from "react";
import { Portal } from "./Portal";
import { useChatTeksten } from "./ChatTekstenContext";
import { vulIn } from "@/lib/i18n/vul-in";

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "😢"];

export interface ActionItem {
  key: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  run: () => void;
}

/** De acties van één bericht als lijst (gebruikt in het telefoonpaneel en het ⋯-menu op een computer). */
export function ActionList({ items, onDone }: { items: ActionItem[]; onDone: () => void }) {
  return (
    <div role="menu" className="py-1">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="menuitem"
          onClick={() => {
            onDone();
            it.run();
          }}
          className={`flex w-full items-center gap-3 whitespace-nowrap px-4 py-2.5 text-left text-sm hover:bg-paper-soft focus-visible:bg-paper-soft focus-visible:outline-none ${it.danger ? "text-crit" : "text-ink"}`}
        >
          <span className={`grid h-5 w-5 flex-shrink-0 place-items-center ${it.danger ? "" : "text-neutralx-500"}`}>{it.icon}</span>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Rij met snelle reacties; jouw huidige reactie is gemarkeerd. */
export function ReactionRow({ selected, onPick }: { selected: string | null; onPick: (emoji: string) => void }) {
  const chat = useChatTeksten();
  return (
    <div className="flex items-center justify-between gap-1 px-3 py-2">
      {QUICK_REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          onClick={() => onPick(e)}
          className={`grid h-11 w-11 place-items-center rounded-full text-2xl leading-none transition-transform hover:scale-110 ${selected === e ? "bg-brand-50 ring-2 ring-brand-400" : "hover:bg-paper-soft"}`}
          aria-label={vulIn(selected === e ? chat.acties.reactieWeghalen : chat.acties.reageerMet, { emoji: e })}
          aria-pressed={selected === e}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/**
 * Telefoon: lang drukken op een bericht opent dit paneel onderin, zoals WhatsApp.
 * Reacties bovenaan, daaronder de acties. Esc of tikken naast het paneel sluit het.
 */
export function MessageSheet({
  preview,
  items,
  reactions,
  onClose,
}: {
  preview: string;
  items: ActionItem[];
  reactions?: { selected: string | null; onPick: (emoji: string) => void };
  onClose: () => void;
}) {
  const chat = useChatTeksten();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <Portal>
      <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={chat.acties.berichtacties}
          className="chat-surface w-full overflow-hidden rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-lift sm:max-w-sm sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-black/15 sm:hidden" aria-hidden />
          {preview && <p className="line-clamp-2 border-b border-hair px-4 pb-2 pt-2 text-xs text-neutralx-500">{preview}</p>}
          {reactions && (
            <div className="border-b border-hair">
              <ReactionRow
                selected={reactions.selected}
                onPick={(e) => {
                  reactions.onPick(e);
                  onClose();
                }}
              />
            </div>
          )}
          <ActionList items={items} onDone={onClose} />
        </div>
      </div>
    </Portal>
  );
}
