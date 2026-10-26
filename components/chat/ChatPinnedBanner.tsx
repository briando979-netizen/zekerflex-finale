"use client";

export function ChatPinnedBanner({ excerpt, onJump, onUnpin }: { excerpt: string; onJump: () => void; onUnpin: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-hair bg-brand-50 px-3 py-2 text-sm">
      <span aria-hidden>📌</span>
      <button type="button" onClick={onJump} className="min-w-0 flex-1 truncate text-left text-ink hover:underline" title={excerpt}>
        {excerpt || "Vastgezet bericht"}
      </button>
      <button type="button" onClick={onUnpin} aria-label="Losmaken" className="flex-shrink-0 text-neutralx-500 hover:text-ink">
        ✕
      </button>
    </div>
  );
}
