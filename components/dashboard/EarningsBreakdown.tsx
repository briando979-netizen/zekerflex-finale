"use client";

import { useEffect, useState } from "react";

interface Breakdown {
  period: string;
  totalEarningsCents: number;
  completedEarningsCents: number;
  pendingEarningsCents: number;
  shiftsCount: number;
  completedShifts: number;
}

export function EarningsBreakdown() {
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/dashboard/earnings-breakdown?period=month");
        if (r.ok) {
          setBreakdown(await r.json());
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) return <div className="text-neutralx-500 text-sm">Laden...</div>;
  if (!breakdown) return null;

  const totalEuros = breakdown.totalEarningsCents / 100;
  const completedEuros = breakdown.completedEarningsCents / 100;
  const pendingEuros = breakdown.pendingEarningsCents / 100;

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-green-50 p-3">
        <p className="text-xs text-neutralx-500">Totaal verdiend</p>
        <p className="text-2xl font-bold text-green-700">€{totalEuros.toFixed(2)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-paper-soft p-3">
          <p className="text-xs text-neutralx-500">Uitbetaald</p>
          <p className="font-semibold">€{completedEuros.toFixed(2)}</p>
        </div>
        <div className="rounded-lg bg-paper-soft p-3">
          <p className="text-xs text-neutralx-500">In afwachting</p>
          <p className="font-semibold text-amber-600">€{pendingEuros.toFixed(2)}</p>
        </div>
      </div>
      <div className="text-xs text-neutralx-600">
        {breakdown.completedShifts} van {breakdown.shiftsCount} klussen afgerond
      </div>
    </div>
  );
}
