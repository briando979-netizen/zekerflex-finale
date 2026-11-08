"use client";

import { useEffect, useState } from "react";

interface Activity {
  id: string;
  shiftId: string;
  shiftTitle: string;
  location: string;
  status: string;
  earnedCents: number;
  createdAt: string;
  startTime: string;
}

export function ActivityLog() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/dashboard/activity-log?limit=10");
        if (r.ok) {
          const data = await r.json();
          setActivities(data.activities || []);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) return <div className="text-neutralx-500 text-sm">Laden...</div>;

  if (activities.length === 0) {
    return <div className="text-neutralx-500 text-sm">Geen activiteiten</div>;
  }

  return (
    <div className="space-y-2">
      {activities.slice(0, 5).map((activity) => (
        <div key={activity.id} className="rounded-lg bg-paper-soft p-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{activity.shiftTitle}</p>
              <p className="text-xs text-neutralx-500">{activity.location}</p>
            </div>
            <p className="font-semibold text-green-600 whitespace-nowrap">
              €{(activity.earnedCents / 100).toFixed(2)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
