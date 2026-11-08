"use client";

import { useEffect, useState } from "react";

type Utilization = {
  overview: {
    totalShifts: number;
    filledShifts: number;
    unfilledShifts: number;
    cancelledShifts: number;
    utilizationRate: number;
    cancellationRate: number;
  };
  quality: {
    avgResponseTimeHours: number;
    fillRatePercentage: number;
    qualityTrend: string;
  };
  byBranch: Array<{ branch: string; shiftsCreated: number }>;
};

export function ShiftUtilizationDashboard() {
  const [data, setData] = useState<Utilization | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/werkgever/shift-utilization");
        if (res.ok) {
          setData(await res.json());
        }
      } catch (err) {
        console.error("Failed to load utilization", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="animate-pulse h-64 bg-paper-soft rounded-lg" />;
  if (!data) return null;

  const utilizationColor = data.overview.utilizationRate >= 80 ? "success" : data.overview.utilizationRate >= 60 ? "warn" : "crit";

  return (
    <div className="rounded-lg border border-hair bg-white p-4 space-y-4">
      <h3 className="font-semibold text-ink">Diensten bezetting</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-paper-soft p-3">
          <p className="text-xs text-neutralx-600">Totaal diensten</p>
          <p className="text-2xl font-bold text-ink">{data.overview.totalShifts}</p>
        </div>
        <div className="rounded-lg bg-paper-soft p-3">
          <p className="text-xs text-neutralx-600">Ingevuld</p>
          <p className="text-2xl font-bold text-success">{data.overview.filledShifts}</p>
        </div>
        <div className="rounded-lg bg-paper-soft p-3">
          <p className="text-xs text-neutralx-600">Open</p>
          <p className="text-2xl font-bold text-warn">{data.overview.unfilledShifts}</p>
        </div>
        <div className="rounded-lg bg-paper-soft p-3">
          <p className="text-xs text-neutralx-600">Geannuleerd</p>
          <p className="text-2xl font-bold text-crit">{data.overview.cancelledShifts}</p>
        </div>
      </div>

      <div className="rounded-lg bg-paper-soft p-3">
        <div className="flex justify-between items-center mb-2">
          <p className="text-sm font-semibold text-ink">Bezettingspercentage</p>
          <p className={`text-lg font-bold text-${utilizationColor}`}>{data.overview.utilizationRate}%</p>
        </div>
        <div className="h-3 bg-white rounded-full overflow-hidden">
          <div
            className={`h-full bg-${utilizationColor}`}
            style={{ width: `${data.overview.utilizationRate}%` }}
          />
        </div>
      </div>

      {data.byBranch.length > 0 && (
        <div className="border-t border-hair pt-3">
          <p className="text-sm font-semibold text-ink mb-2">Per afdeling</p>
          <div className="space-y-1">
            {data.byBranch.slice(0, 5).map((b) => (
              <div key={b.branch} className="flex justify-between text-xs">
                <span className="text-neutralx-600">{b.branch}</span>
                <span className="font-semibold text-ink">{b.shiftsCreated} diensten</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
