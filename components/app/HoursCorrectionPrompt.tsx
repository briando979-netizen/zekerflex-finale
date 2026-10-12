"use client";

import { useState, useTransition } from "react";
import { acceptCorrectionAction, rejectCorrectionAction } from "@/app/dashboard/uren/[timesheetId]/actions";

export function HoursCorrectionPrompt({
  disputeId,
  timesheetId,
  claimedHours,
  proposedHours,
  reason,
}: {
  disputeId: string;
  timesheetId: string;
  claimedHours: number;
  proposedHours: number;
  reason: string;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="rounded-2xl border border-hair bg-white p-5 shadow-card">
        <p className="text-sm font-semibold text-ink">{done}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-warn/40 bg-warn/5 p-5 shadow-card">
      <p className="text-sm font-semibold text-ink">Voorstel voor correctie van je uren</p>
      <p className="mt-1.5 text-sm text-neutralx-600">
        De opdrachtgever stelt voor je uren aan te passen van <strong>{claimedHours.toFixed(2)}</strong> naar{" "}
        <strong>{proposedHours.toFixed(2)}</strong> uur.
      </p>
      {reason && <p className="mt-1.5 text-xs italic text-neutralx-500">&ldquo;{reason}&rdquo;</p>}
      <p className="mt-2 text-xs text-neutralx-500">
        Ga je niet akkoord? Dan beoordeelt ZekerFlex dit onafhankelijk.
      </p>
      {error && <p className="mt-2 text-xs text-crit">{error}</p>}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await acceptCorrectionAction(disputeId, timesheetId);
              if (r.ok) setDone(r.message);
              else setError(r.message);
            })
          }
          className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
        >
          {pending ? "Bezig…" : "Ja, akkoord"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await rejectCorrectionAction(disputeId, timesheetId);
              if (r.ok) setDone(r.message);
              else setError(r.message);
            })
          }
          className="btn-ghost px-4 py-2 text-sm text-crit disabled:opacity-50"
        >
          Nee, niet akkoord
        </button>
      </div>
    </div>
  );
}
