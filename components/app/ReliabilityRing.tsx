/**
 * Betrouwbaarheidsring — the freelancer's own reliability score, visible with
 * a short explanation + recovery path. Presentational (server-safe).
 */
export function ReliabilityRing({
  score,
  shiftsCompleted,
  size = 92,
}: {
  score: number;
  shiftsCompleted: number;
  size?: number;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const tone = pct >= 90 ? "#0E5C4A" : pct >= 70 ? "#B45309" : "#B91C1C";

  const band =
    pct >= 90
      ? { label: "Uitstekend", note: "Je krijgt het meeste en beste aanbod." }
      : pct >= 75
        ? { label: "Goed", note: "Een paar diensten op tijd houdt je hier of hoger." }
        : pct >= 60
          ? { label: "Let op", note: "Onder de 60 daalt je aanbod. 3 diensten zonder incident = herstel." }
          : { label: "Beperkt", note: "Je aanbod is tijdelijk lager. Elke dienst op tijd telt mee voor herstel." };

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
        <text x="50%" y="48%" textAnchor="middle" fontFamily="'IBM Plex Mono', monospace" fontSize="18" fontWeight="600" fill="currentColor">
          {pct}
        </text>
        <text x="50%" y="64%" textAnchor="middle" fontSize="8" fill="#8A93A0">
          betrouwbaar
        </text>
      </svg>
      <div>
        <p className="text-sm font-semibold text-ink">{band.label}</p>
        <p className="mt-0.5 max-w-xs text-xs leading-relaxed text-neutralx-600">{band.note}</p>
        <p className="mt-1 text-xs text-neutralx-400">{shiftsCompleted} diensten voltooid</p>
      </div>
    </div>
  );
}
