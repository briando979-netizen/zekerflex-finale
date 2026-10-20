"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { repeatShiftAction } from "@/app/werkgever/diensten/[shiftId]/actions";

/** "Zelfde team volgende week": repeat this klus and offer it to the same people first. */
export function RepeatTeamButton({ shiftId, teamSize }: { shiftId: string; teamSize: number }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [weeks, setWeeks] = useState(1);

  function repeat() {
    start(async () => {
      const res = await repeatShiftAction(shiftId, weeks);
      if (res.ok && res.shiftId) {
        toast.success(res.message);
        router.push(`/werkgever/diensten/${res.shiftId}`);
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-plan/25 bg-plan-soft px-4 py-3">
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-plan text-white" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M18 3v4h-4M6 21v-4h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-plan-ink">Zelfde klus, zelfde team</p>
        <p className="text-xs text-neutralx-600">
          {teamSize > 0
            ? `Herhaal deze klus en bied hem eerst privé aan de ${teamSize === 1 ? "persoon" : `${teamSize} mensen`} van nu aan.`
            : "Herhaal deze klus met dezelfde tijden, tarief en omschrijving."}
        </p>
      </div>
      <select
        value={weeks}
        onChange={(e) => setWeeks(Number(e.target.value))}
        aria-label="Hoeveel weken later"
        className="rounded-lg border border-hairstrong bg-white px-2 py-1.5 text-sm"
        disabled={pending}
      >
        <option value={1}>Volgende week</option>
        <option value={2}>Over 2 weken</option>
        <option value={4}>Over 4 weken</option>
      </select>
      <button type="button" onClick={repeat} disabled={pending} className="btn-primary text-sm">
        {pending ? "Bezig…" : "Herhalen"}
      </button>
    </div>
  );
}
