import type { FreelancerDict } from "@/lib/i18n/freelancer";

/**
 * Betrouwbaarheidsring — the freelancer's own reliability score, visible with
 * a short explanation + recovery path. Presentational (server-safe); texts come
 * from the freelancer dictionary (`ring`) so they follow the app language.
 */
export function ReliabilityRing({
  score,
  shiftsCompleted,
  size = 92,
  t,
}: {
  score: number;
  shiftsCompleted: number;
  size?: number;
  t: FreelancerDict["ring"];
}) {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const tone = pct >= 90 ? "#0E5C4A" : pct >= 70 ? "#B45309" : "#B91C1C";

  // Teksten volgen de berekening in lib/worker/stats-sync.ts (reliabilityFrom):
  // een misser telt na 3 goed afgeronde diensten nog half, na een half jaar ook.
  const band =
    pct >= 90
      ? { label: t.excellent, note: t.excellentNote }
      : pct >= 75
        ? { label: t.good, note: t.goodNote }
        : pct >= 60
          ? { label: t.attention, note: t.attentionNote }
          : { label: t.limited, note: t.limitedNote };

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E6E7E1" strokeWidth="8" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="48%" textAnchor="middle" fontFamily="var(--font-mono), monospace" fontSize="18" fontWeight="600" fill="currentColor">
          {pct}
        </text>
        <text x="50%" y="64%" textAnchor="middle" fontSize="8" fill="#8A93A0">
          {t.label}
        </text>
      </svg>
      <div>
        <p className="text-sm font-semibold text-ink">{band.label}</p>
        <p className="mt-0.5 max-w-xs text-xs leading-relaxed text-neutralx-600">{band.note}</p>
        <p className="mt-1 text-xs text-neutralx-400">{t.completed(shiftsCompleted)}</p>
      </div>
    </div>
  );
}
