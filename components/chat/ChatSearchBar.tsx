"use client";

export function ChatSearchBar({
  query,
  onQuery,
  count,
  position,
  onPrev,
  onNext,
  onClose,
}: {
  query: string;
  onQuery: (v: string) => void;
  count: number;
  position: number;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-hair bg-paper-soft px-3 py-2">
      <span aria-hidden>🔍</span>
      <input
        autoFocus
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Zoek in dit gesprek…"
        aria-label="Zoek in dit gesprek"
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-neutralx-400"
      />
      <span className="whitespace-nowrap text-xs text-neutralx-500">{count ? `${position}/${count}` : query ? "geen" : ""}</span>
      <button type="button" onClick={onPrev} disabled={!count} aria-label="Vorige treffer" className="px-1 text-neutralx-500 disabled:opacity-40">
        ▲
      </button>
      <button type="button" onClick={onNext} disabled={!count} aria-label="Volgende treffer" className="px-1 text-neutralx-500 disabled:opacity-40">
        ▼
      </button>
      <button type="button" onClick={onClose} aria-label="Sluit zoeken" className="px-1 text-neutralx-500 hover:text-ink">
        ✕
      </button>
    </div>
  );
}
