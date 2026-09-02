"use client";

import { useState, useTransition } from "react";
import { applyToSeriesAction } from "@/app/dashboard/klussen/actions";
import { useToast } from "@/components/ui/Toast";

interface Day {
  shiftId: string;
  date: string;
  weekday: string;
  seatsFree: number;
  mine: boolean;
}

export function SeriesApply({
  days,
  currentShiftId,
  disabled,
}: {
  days: Day[];
  currentShiftId: string;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [sel, setSel] = useState<Set<string>>(
    new Set(days.filter((d) => d.shiftId === currentShiftId && d.seatsFree > 0 && !d.mine).map((d) => d.shiftId)),
  );
  const [pending, start] = useTransition();
  const [doneCount, setDoneCount] = useState(0);

  const toggle = (id: string) =>
    setSel((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const selectable = days.filter((d) => d.seatsFree > 0 && !d.mine);
  const allSelected = selectable.length > 0 && selectable.every((d) => sel.has(d.shiftId));

  if (doneCount > 0) {
    return (
      <div className="rounded-lg border border-ok/30 bg-ok/5 p-3 text-sm text-neutralx-700">
        Je bent aangenomen voor {doneCount} {doneCount === 1 ? "dag" : "dagen"}. Je vindt ze bij Mijn klussen.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-ink">Meerdaagse klus — kies je dagen</p>
        {selectable.length > 1 && (
          <button
            type="button"
            onClick={() => setSel(allSelected ? new Set() : new Set(selectable.map((d) => d.shiftId)))}
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            {allSelected ? "Wis selectie" : "Selecteer alle"}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {days.map((d) => {
          const isMine = d.mine;
          const full = d.seatsFree <= 0 && !isMine;
          const checked = sel.has(d.shiftId);
          return (
            <button
              key={d.shiftId}
              type="button"
              disabled={isMine || full || disabled}
              onClick={() => toggle(d.shiftId)}
              className={`rounded-lg border px-2.5 py-2 text-left text-xs transition ${
                isMine
                  ? "border-ok/40 bg-ok/5 text-ok"
                  : full
                    ? "border-hair bg-paper-soft text-neutralx-300"
                    : checked
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-hairstrong hover:border-brand-300"
              }`}
            >
              <span className="block font-semibold capitalize">{d.weekday}</span>
              <span className="block text-[11px] opacity-70">{d.date.slice(5)}</span>
              <span className="mt-0.5 block text-[10px]">
                {isMine ? "aangenomen" : full ? "vol" : checked ? "✓ gekozen" : `${d.seatsFree} vrij`}
              </span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={pending || sel.size === 0 || disabled}
        onClick={() =>
          start(async () => {
            const r = await applyToSeriesAction([...sel]);
            if (r.ok) {
              setDoneCount(sel.size);
              toast.success(r.message);
            } else {
              toast.error(r.message);
            }
          })
        }
        className="btn-primary mt-3 w-full py-2 text-sm disabled:opacity-40"
      >
        {pending ? "Bezig…" : sel.size <= 1 ? "Aannemen" : `Aannemen voor ${sel.size} dagen`}
      </button>
    </div>
  );
}
