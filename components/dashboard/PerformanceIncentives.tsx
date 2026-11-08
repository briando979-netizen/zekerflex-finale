"use client";

import { useEffect, useState } from "react";

type Incentives = {
  bonus: number;
  achievements: string[];
  progress: {
    completed: number;
    goal: number;
    completionRate: number;
  };
};

export function PerformanceIncentives() {
  const [incentives, setIncentives] = useState<Incentives | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard/performance-incentives");
        if (res.ok) {
          setIncentives(await res.json());
        }
      } catch (err) {
        console.error("Failed to load incentives", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="animate-pulse h-48 bg-paper-soft rounded-lg" />;
  if (!incentives) return null;

  const bonusPercentage = Math.round((incentives.progress.completed / incentives.progress.goal) * 100);

  return (
    <div className="rounded-lg border border-hair bg-white p-4">
      <h3 className="font-semibold text-sm text-ink mb-3">Bonusvoordelen deze maand</h3>

      <div className="mb-4 p-3 rounded-lg bg-money/10 border border-money/20">
        <p className="text-xs text-neutralx-600">Je hebt verdiend</p>
        <p className="text-3xl font-bold text-money">€{incentives.bonus}</p>
        <p className="text-xs text-neutralx-500 mt-1">Extra inkomsten door sterke prestaties</p>
      </div>

      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-semibold text-ink">Diensten deze maand</span>
          <span className="text-xs text-neutralx-600">
            {incentives.progress.completed}/{incentives.progress.goal}
          </span>
        </div>
        <div className="h-2 bg-paper-soft rounded-full overflow-hidden">
          <div className="h-full bg-brand-500" style={{ width: `${Math.min(100, bonusPercentage)}%` }} />
        </div>
      </div>

      {incentives.achievements.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-ink">Behaalde bonussen:</p>
          {incentives.achievements.map((ach) => {
            const bonusMap = {
              reliability: "€25 — 95%+ succes",
              volume: "€40 — 20+ diensten",
              excellence: "€30 — 4.7⭐ beoordeling",
              consistent: "€15 — 10+ diensten",
            };
            return (
              <div key={ach} className="flex items-center gap-2 p-2 rounded-lg bg-success/10">
                <span className="text-sm text-success">✓</span>
                <span className="text-xs font-semibold text-success">
                  {bonusMap[ach as keyof typeof bonusMap] || ach}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
