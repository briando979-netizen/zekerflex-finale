"use client";

import { useEffect, useState } from "react";

type Recommendation = {
  id: string;
  company: string;
  skills: string[];
  hourlyRate: number;
  startsAt: string;
  match: number;
};

export function AIRecommendations() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard/ai-recommendations");
        if (res.ok) {
          const data = await res.json();
          setRecommendations(data.recommendations || []);
        }
      } catch (err) {
        console.error("Failed to load recommendations", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="animate-pulse h-48 bg-paper-soft rounded-lg" />;

  if (recommendations.length === 0) {
    return (
      <div className="rounded-lg border border-hair bg-white p-4 text-center">
        <p className="text-sm text-neutralx-600">Geen aanbevelingen beschikbaar</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-hair bg-white p-4">
      <h3 className="font-semibold text-ink mb-3">AI-aanbevelingen voor jou</h3>

      <div className="space-y-2">
        {recommendations.map((rec) => (
          <div key={rec.id} className="p-3 rounded-lg border border-hair hover:bg-paper-soft transition-colors">
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1">
                <p className="font-semibold text-sm text-ink">{rec.company}</p>
                <p className="text-xs text-neutralx-600">€{rec.hourlyRate}/uur</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-brand-500/10 flex items-center justify-center">
                  <span className="text-xs font-bold text-brand-500">{rec.match}%</span>
                </div>
              </div>
            </div>

            {rec.skills.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {rec.skills.slice(0, 2).map((skill) => (
                  <span key={skill} className="inline-flex px-2 py-0.5 bg-brand-500/10 text-xs rounded-full text-brand-500 font-semibold">
                    {skill}
                  </span>
                ))}
                {rec.skills.length > 2 && <span className="text-xs text-neutralx-600">+{rec.skills.length - 2}</span>}
              </div>
            )}

            <div className="flex gap-2">
              <button className="flex-1 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600">
                Interesse
              </button>
              <button className="px-3 py-1.5 rounded-lg border border-hair text-xs font-semibold hover:bg-paper-soft">
                Later
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
