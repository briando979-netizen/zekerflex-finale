"use client";

import { useState } from "react";
import Link from "next/link";
import { FreelancerRelationButton } from "@/components/app/FreelancerRelationButton";

export interface WerkerKaart {
  userId: string;
  naam: string;
  badge: string;
  ratingLine: string;
  shiftsCompleted: number;
  attendancePct: number;
  cancellations: number;
  note?: string;
}

interface Teksten {
  zoekPlaceholder: string;
  statShifts: string;
  statAttendance: string;
  statCancellations: string;
  inviteForShift: string;
  emptySearch: string;
}

const BADGE: Record<string, string> = {
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
};

export function WerkerLijstMetZoeken({ werkers, t }: { werkers: WerkerKaart[]; t: Teksten }) {
  const [zoek, setZoek] = useState("");

  const gefilterd = zoek.trim()
    ? werkers.filter((w) => w.naam.toLowerCase().includes(zoek.toLowerCase().trim()))
    : werkers;

  return (
    <div>
      {werkers.length > 2 && (
        <div className="mb-4">
          <input
            type="search"
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder={t.zoekPlaceholder}
            className="w-full max-w-sm rounded-xl border border-hair bg-white px-4 py-2.5 text-sm text-ink placeholder:text-neutralx-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
      )}

      {gefilterd.length === 0 ? (
        <p className="text-sm text-neutralx-500">{t.emptySearch}</p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {gefilterd.map((c) => (
            <li key={c.userId} className="surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-base font-bold text-ink">{c.naam}</p>
                  <p className="mt-0.5 text-xs text-neutralx-400">
                    {BADGE[c.badge] ?? c.badge}
                    {c.ratingLine ? ` · ${c.ratingLine}` : ""}
                  </p>
                </div>
                <FreelancerRelationButton userId={c.userId} name={c.naam} kind="favorite" active />
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Stat label={t.statShifts} value={String(c.shiftsCompleted)} />
                <Stat label={t.statAttendance} value={`${c.attendancePct}%`} />
                <Stat label={t.statCancellations} value={String(c.cancellations)} />
              </dl>

              {c.note && <p className="mt-3 text-xs italic text-neutralx-500">"{c.note}"</p>}

              <div className="mt-3 flex items-center gap-2 border-t border-hair pt-3">
                <Link href="/werkgever/diensten/nieuw" className="btn-ghost px-3 py-1.5 text-xs">
                  {t.inviteForShift}
                </Link>
                <FreelancerRelationButton userId={c.userId} name={c.naam} kind="block" active={false} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-hair bg-white px-2 py-2">
      <p className="num font-display text-lg font-bold text-ink">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-neutralx-400">{label}</p>
    </div>
  );
}
