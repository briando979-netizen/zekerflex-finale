"use client";

import { useState, useTransition } from "react";
import { counterOfferAction } from "@/app/dashboard/klussen/actions";
import { useToast } from "@/components/ui/Toast";

export function CounterOfferForm({
  shiftId,
  listedRateCents,
  existing,
  disabled,
}: {
  shiftId: string;
  listedRateCents: number;
  existing: { proposedRateCents: number; status: string } | null;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(Math.round(listedRateCents / 100) + 2);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState(existing?.status === "pending");

  if (done || existing?.status === "pending") {
    return (
      <div className="rounded-lg border border-warn/30 bg-warn/5 p-3 text-sm">
        <p className="font-medium text-ink">Je tegenbod loopt</p>
        <p className="mt-0.5 text-neutralx-600">
          € {((existing?.proposedRateCents ?? rate * 100) / 100).toFixed(2)}/u — in afwachting van de werkgever.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="btn-ghost w-full py-2 text-sm disabled:opacity-40"
      >
        Doe een tegenbod
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-hair bg-paper-soft/60 p-3">
      <p className="text-sm font-medium text-ink">Jouw tegenbod</p>
      <p className="mt-0.5 text-xs text-neutralx-500">
        Aangeboden: € {(listedRateCents / 100).toFixed(2)}/u. Stel je eigen uurtarief voor.
      </p>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <span className="text-neutralx-600">€</span>
        <input
          type="number"
          min={10}
          max={250}
          step={0.5}
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="w-24 rounded-lg border border-hairstrong px-2 py-1.5 text-sm outline-none focus:border-brand-500"
        />
        <span className="text-neutralx-600">/uur</span>
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Toelichting (optioneel) — bv. ervaring, reistijd, weekendtoeslag"
        className="mt-2 w-full rounded-lg border border-hairstrong px-2 py-1.5 text-sm outline-none focus:border-brand-500"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-neutralx-400">
          Annuleer
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await counterOfferAction(shiftId, Math.round(rate * 100), note);
              if (r.ok) {
                setDone(true);
                toast.success("Tegenbod verstuurd", r.message);
              } else {
                toast.error(r.message);
              }
            })
          }
          className="btn-primary px-3 py-1.5 text-xs"
        >
          {pending ? "Versturen…" : "Verstuur tegenbod"}
        </button>
      </div>
    </div>
  );
}
