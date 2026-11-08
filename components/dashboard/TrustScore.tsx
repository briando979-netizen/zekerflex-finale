"use client";

import { useEffect, useState } from "react";
import { ProgressRing } from "@/components/ui/ProgressRing";

type Score = {
  score: number;
  badges: string[];
  stats: {
    completedShifts: number;
    totalShifts: number;
    completionRate: number;
    avgRating: number;
    reviewCount: number;
    skills: number;
    disputes: number;
  };
  level: "premium" | "trusted" | "standard";
};

export function TrustScore() {
  const [score, setScore] = useState<Score | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard/trust-score");
        if (res.ok) {
          setScore(await res.json());
        }
      } catch (err) {
        console.error("Failed to load trust score", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="animate-pulse h-32 bg-paper-soft rounded-lg" />;
  if (!score) return <div className="text-center text-neutralx-500">Failed to load trust score</div>;

  const levelColors = {
    premium: "text-success",
    trusted: "text-brand-500",
    standard: "text-neutralx-400",
  };

  return (
    <div className="rounded-lg border border-hair bg-white p-4">
      <div className="flex items-center gap-4">
        <ProgressRing score={score.score} size={80} />
        <div className="flex-1">
          <p className="font-semibold text-sm text-neutralx-600">Werkerscore</p>
          <p className={`text-2xl font-bold ${levelColors[score.level]}`}>{score.score}/100</p>
          <p className="text-xs text-neutralx-500 mt-1 capitalize">{score.level}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-paper-soft p-2">
          <p className="text-xs text-neutralx-600">Afgeronde diensten</p>
          <p className="font-semibold">{score.stats.completedShifts}</p>
        </div>
        <div className="rounded-lg bg-paper-soft p-2">
          <p className="text-xs text-neutralx-600">Succes %</p>
          <p className="font-semibold">{score.stats.completionRate}%</p>
        </div>
        <div className="rounded-lg bg-paper-soft p-2">
          <p className="text-xs text-neutralx-600">Beoordeling</p>
          <p className="font-semibold">{score.stats.avgRating.toFixed(1)}⭐</p>
        </div>
        <div className="rounded-lg bg-paper-soft p-2">
          <p className="text-xs text-neutralx-600">Vaardigheden</p>
          <p className="font-semibold">{score.stats.skills}</p>
        </div>
      </div>

      {score.badges.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {score.badges.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-xs font-semibold text-success capitalize"
            >
              ✓ {badge.replace("-", " ")}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
