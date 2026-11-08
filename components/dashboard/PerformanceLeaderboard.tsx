"use client";

import { useEffect, useState } from "react";

type LeaderboardEntry = {
  rank: number;
  workerName: string;
  value: number;
  badge?: string;
};

export function PerformanceLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<"earnings" | "shifts" | "rating">("shifts");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/dashboard/leaderboard?type=${type}&period=monthly`);
        if (res.ok) {
          // Mock data for now - in production would use actual response
          const mockData: LeaderboardEntry[] = [
            { rank: 1, workerName: "Jan", value: 45, badge: "🔥" },
            { rank: 2, workerName: "Maria", value: 42 },
            { rank: 3, workerName: "Peter", value: 38 },
            { rank: 4, workerName: "Sophie", value: 35 },
            { rank: 5, workerName: "Ahmed", value: 32 },
          ];
          setEntries(mockData);
        }
      } catch (err) {
        console.error("Failed to load leaderboard", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [type]);

  if (loading) return <div className="animate-pulse h-64 bg-paper-soft rounded-lg" />;

  const typeLabels = {
    earnings: "Meeste inkomsten",
    shifts: "Meeste diensten",
    rating: "Beste beoordeeld",
  };

  return (
    <div className="rounded-lg border border-hair bg-white p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-ink">Leaderboard</h3>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="text-xs rounded-lg border border-hairstrong px-2 py-1"
        >
          <option value="shifts">Diensten</option>
          <option value="earnings">Inkomsten</option>
          <option value="rating">Beoordeling</option>
        </select>
      </div>

      <p className="text-xs text-neutralx-600 mb-3">{typeLabels[type]}</p>

      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.rank} className="flex items-center gap-3 p-2 rounded-lg hover:bg-paper-soft">
            <div className="w-6 text-center">
              <span className="text-xs font-bold text-neutralx-600">#{entry.rank}</span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-ink">{entry.workerName}</span>
                {entry.badge && <span>{entry.badge}</span>}
              </div>
            </div>
            <div className="text-right">
              {type === "shifts" && <span className="font-bold text-ink">{entry.value} diensten</span>}
              {type === "earnings" && <span className="font-bold text-money">€{entry.value * 15}</span>}
              {type === "rating" && <span className="font-bold text-success">{(entry.value / 10).toFixed(1)}⭐</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
