"use client";

import { useEffect, useState } from "react";

type Stats = {
  shiftsThisWeek: number;
  workersActive: number;
  pendingApprovals: number;
  revenueThisMonth: number;
};

export function QuickStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/werkgever/dashboard-stats");
        if (res.ok) {
          setStats(await res.json());
        }
      } catch (err) {
        console.error("Failed to load stats", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading)
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse h-20 bg-paper-soft rounded-lg" />
        ))}
      </div>
    );

  if (!stats) return null;

  const statCards = [
    { label: "Deze week", value: stats.shiftsThisWeek, unit: "diensten", color: "brand" },
    { label: "Actieve werkers", value: stats.workersActive, unit: "", color: "success" },
    { label: "Goedkeuren", value: stats.pendingApprovals, unit: "uren", color: "warn" },
    { label: "Deze maand", value: `€${stats.revenueThisMonth}`, unit: "omzet", color: "money" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {statCards.map((card) => (
        <div key={card.label} className={`rounded-lg border border-hair bg-white p-4`}>
          <p className="text-xs text-neutralx-600">{card.label}</p>
          <p className={`mt-2 text-2xl font-bold text-${card.color}-500`}>{card.value}</p>
          {card.unit && <p className="mt-1 text-xs text-neutralx-500">{card.unit}</p>}
        </div>
      ))}
    </div>
  );
}
