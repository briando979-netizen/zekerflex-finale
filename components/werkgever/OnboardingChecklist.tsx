"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  link?: string;
}

export function OnboardingChecklist() {
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [completion, setCompletion] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetch("/api/werkgever/onboarding-checklist");
        if (r.ok) {
          const data = await r.json();
          setChecklist(data.checklist || []);
          setCompletion(data.completionPercentage || 0);
        }
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  if (loading) return <div className="text-neutralx-500 text-sm">Laden...</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Snelstartgids</h3>
        <span className="text-sm font-bold text-brand-600">{completion}%</span>
      </div>

      <div className="h-2 rounded-full bg-paper-soft overflow-hidden">
        <div
          className="h-full bg-brand-600 transition-all"
          style={{ width: `${completion}%` }}
        />
      </div>

      <div className="space-y-2">
        {checklist.map((item) => (
          <Link key={item.id} href={item.link || "#"}>
            <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-paper-soft transition cursor-pointer">
              <div
                className={`mt-1 h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  item.completed
                    ? "bg-green-500 border-green-500"
                    : "border-neutralx-300"
                }`}
              >
                {item.completed && (
                  <span className="text-white text-xs">✓</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={item.completed ? "line-through text-neutralx-400" : "font-medium text-sm"}>
                  {item.title}
                </p>
                <p className="text-xs text-neutralx-500">{item.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
