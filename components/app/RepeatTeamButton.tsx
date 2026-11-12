"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { repeatShiftAction } from "@/app/werkgever/diensten/[shiftId]/actions";

/** "Zelfde team volgende week": repeat this klus and offer it to the same people first. */
export function RepeatTeamButton({ shiftId, teamSize }: { shiftId: string; teamSize: number }) {
  const toast = useToast();
  const router = useRouter();
  const k = useT().herhaalKnop;
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
      {/* min-w: on a phone the text keeps its own line and the controls wrap below it */}
      <div className="min-w-[12rem] flex-1">
        <p className="text-sm font-semibold text-plan-ink">{k.kop}</p>
        <p className="text-xs text-neutralx-600">
          {teamSize > 0
            ? fmt(teamSize === 1 ? k.metTeamEen : k.metTeamMeer, { n: teamSize })
            : k.zonderTeam}
        </p>
      </div>
      <select
        value={weeks}
        onChange={(e) => setWeeks(Number(e.target.value))}
        aria-label={k.aria}
        className="rounded-lg border border-hairstrong bg-white px-2 py-1.5 text-sm"
        disabled={pending}
      >
        <option value={1}>{k.w1}</option>
        <option value={2}>{k.w2}</option>
        <option value={4}>{k.w4}</option>
      </select>
      <button type="button" onClick={repeat} disabled={pending} className="btn-primary text-sm">
        {pending ? k.bezig : k.herhalen}
      </button>
    </div>
  );
}
