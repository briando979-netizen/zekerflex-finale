"use client";

import { Portal } from "./Portal";
import { useChatTeksten } from "./ChatTekstenContext";
import { STICKER_IDS, stickerSrc, type StickerId } from "@/lib/messaging/stickers";

// Een sticker kiezen (15 nov 2026): de eigen set (lib/messaging/stickers.ts), in een raster. Tikken verstuurt meteen,
// zoals in WhatsApp.

export function StickerKiezer({ onKies, onCancel }: { onKies: (id: StickerId) => void; onCancel: () => void }) {
  const chat = useChatTeksten();
  const t = chat.composer;
  const namen = chat.bubble.stickerNamen;
  return (
    <Portal>
      <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/60 sm:items-center" onClick={onCancel}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t.stickerKiezen}
          className="chat-surface w-full rounded-t-2xl bg-white p-4 shadow-lift sm:max-w-sm sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-3 font-display text-sm font-bold text-ink">{t.stickerKiezen}</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {STICKER_IDS.map((id) => (
              <button key={id} type="button" onClick={() => onKies(id)} title={namen[id]} className="rounded-xl p-1.5 hover:bg-paper-soft focus-visible:ring-2 focus-visible:ring-brand-400">
                {/* eslint-disable-next-line @next/next/no-img-element -- vaste svg van de eigen site */}
                <img src={stickerSrc(id)} alt={namen[id]} width={64} height={64} draggable={false} className="mx-auto h-16 w-16 select-none" />
              </button>
            ))}
          </div>
          <button type="button" onClick={onCancel} className="mt-3 w-full rounded-lg px-3 py-2 text-sm text-neutralx-500 hover:bg-paper-soft">
            {t.annuleren}
          </button>
        </div>
      </div>
    </Portal>
  );
}
