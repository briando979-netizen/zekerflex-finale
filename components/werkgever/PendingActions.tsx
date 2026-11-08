"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Action {
  type: string;
  count: number;
  priority: "high" | "medium" | "low";
  link?: string;
}

const ACTION_LABELS: Record<string, string> = {
  timesheets_pending: "Uren goed te keuren",
  team_invites_pending: "Teamuitnodigingen",
  shifts_draft: "Onvoltooide klussen",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-blue-100 text-blue-800",
};

export function PendingActions() {
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/werkgever/pending-actions");
        if (r.ok) {
          const data = await r.json();
          setActions(data.actions || []);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) return <div className="text-neutralx-500 text-sm">Laden...</div>;

  if (actions.length === 0) {
    return <div className="text-neutralx-500 text-sm">Alles onder controle!</div>;
  }

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <Link key={action.type} href={action.link || "#"}>
          <div className={`rounded-lg p-3 cursor-pointer hover:opacity-80 transition ${PRIORITY_COLORS[action.priority]}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {ACTION_LABELS[action.type] || action.type}
              </span>
              <span className="font-semibold">{action.count}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
