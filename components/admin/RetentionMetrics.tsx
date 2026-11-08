"use client";

import { useEffect, useState } from "react";

type RetentionData = {
  atRiskWorkers: number;
  activeWorkers: number;
  totalWorkers: number;
  retentionRate: number;
};

export function RetentionMetrics() {
  const [data, setData] = useState<RetentionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // This would normally call an API endpoint
        // For now, just show placeholder data
        setData({
          atRiskWorkers: 12,
          activeWorkers: 284,
          totalWorkers: 426,
          retentionRate: 67,
        });
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) return <div className="animate-pulse h-48 bg-paper-soft rounded-lg" />;
  if (!data) return null;

  return (
    <div className="rounded-lg border border-hair bg-white p-4">
      <h3 className="font-semibold text-ink mb-4">Werkerbehoud (Retentie)</h3>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg bg-paper-soft p-3">
          <p className="text-xs text-neutralx-600">Actief (30d)</p>
          <p className="text-2xl font-bold text-success">{data.activeWorkers}</p>
          <p className="text-xs text-neutralx-500 mt-1">van {data.totalWorkers}</p>
        </div>
        <div className="rounded-lg bg-paper-soft p-3">
          <p className="text-xs text-neutralx-600">Retentierate</p>
          <p className="text-2xl font-bold text-brand-500">{data.retentionRate}%</p>
        </div>
      </div>

      <div className="rounded-lg bg-warn/10 border border-warn/20 p-3">
        <p className="text-sm font-semibold text-warn mb-1">⚠ {data.atRiskWorkers} werkers at risk</p>
        <p className="text-xs text-neutralx-600">Niet actief de afgelopen 30 dagen</p>
        <button className="mt-2 px-3 py-1 rounded-lg bg-warn text-white text-xs font-semibold hover:bg-warn/90">
          Re-engagement campagne
        </button>
      </div>

      <div className="mt-3 border-t border-hair pt-3">
        <p className="text-xs font-semibold text-ink mb-2">Retentietrend</p>
        <div className="h-12 bg-paper-soft rounded-lg flex items-center justify-center">
          <p className="text-xs text-neutralx-500">Grafiek: Trend afgelopen 90 dagen</p>
        </div>
      </div>
    </div>
  );
}
