"use client";

export function ForwardPicker({
  items,
  onPick,
  onClose,
}: {
  items: { id: string; label: string }[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[70vh] w-full max-w-sm overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hair px-4 py-3">
          <p className="text-sm font-semibold text-ink">Doorsturen naar…</p>
          <button type="button" onClick={onClose} aria-label="Sluiten" className="text-neutralx-500 hover:text-ink">
            ✕
          </button>
        </div>
        <div className="max-h-[58vh] overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-neutralx-500">Geen ander gesprek om naar door te sturen.</p>
          ) : (
            items.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => onPick(it.id)}
                className="block w-full truncate px-4 py-3 text-left text-sm text-ink hover:bg-paper-soft"
              >
                {it.label}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
