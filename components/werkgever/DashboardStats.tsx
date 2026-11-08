"use client";

import { useEffect, useState } from "react";

interface Stats {
  shiftsCreated: number;
  shiftsThisWeek: number;
  shiftsThisMonth: number;
  activeWorkers: number;
  pendingApprovals: number;
}

export function DashboardStats({ tenantId }: { tenantId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/werkgever/dashboard-stats");
        if (r.ok) {
          setStats(await r.json());
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) return <div className="text-neutralx-500">Laden...</div>;
  if (!stats) return <div className="text-red-600">Fout bij laden</div>;

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <div className="rounded-lg bg-paper-soft p-3">
        <p className="text-xs text-neutralx-500">Klussen totaal</p>
        <p className="text-lg font-semibold">{stats.shiftsCreated}</p>
      </div>
      <div className="rounded-lg bg-paper-soft p-3">
        <p className="text-xs text-neutralx-500">Deze week</p>
        <p className="text-lg font-semibold">{stats.shiftsThisWeek}</p>
      </div>
      <div className="rounded-lg bg-paper-soft p-3">
        <p className="text-xs text-neutralx-500">Deze maand</p>
        <p className="text-lg font-semibold">{stats.shiftsThisMonth}</p>
      </div>
      <div className="rounded-lg bg-paper-soft p-3">
        <p className="text-xs text-neutralx-500">Actieve werkers</p>
        <p className="text-lg font-semibold">{stats.activeWorkers}</p>
      </div>
      <div className="rounded-lg bg-paper-soft p-3">
        <p className="text-xs text-neutralx-500">Goed te keuren</p>
        <p className="text-lg font-semibold text-amber-600">{stats.pendingApprovals}</p>
      </div>
    </div>
  );
}
