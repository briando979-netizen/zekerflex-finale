// Pure-SVG chart primitives for the admin dashboard. No dependencies.
// Colours pull from the .admin-scope CSS vars where possible.

const GREEN = "#10b981";
const BLUE = "#60a5fa";
const GREY = "#8b8b93";

/** Concentric arc gauge — the "Insights" ring from the reference. */
export function RingGauge({
  center,
  rings,
  size = 150,
}: {
  center: string;
  rings: { value: number; color?: string; label?: string }[];
  size?: number;
}) {
  const stroke = 9;
  const gap = 5;
  const palette = [GREEN, BLUE, GREY, "#a78bfa"];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      {rings.map((r, i) => {
        const radius = size / 2 - stroke / 2 - i * (stroke + gap);
        const c = 2 * Math.PI * radius;
        const off = c * (1 - Math.max(0, Math.min(1, r.value / 100)));
        const col = r.color ?? palette[i % palette.length];
        return (
          <g key={i} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity="0.09" strokeWidth={stroke} />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={col}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={off}
            />
          </g>
        );
      })}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.22} fontWeight="700" fill="currentColor">
        {center}
      </text>
    </svg>
  );
}

/** Rounded / pill bar chart. */
export function PillBars({
  data,
  height = 150,
  color = "currentColor",
  labels,
}: {
  data: number[];
  height?: number;
  color?: string;
  labels?: string[];
}) {
  const max = Math.max(...data, 1);
  const barW = 100 / (data.length * 2 - 1);
  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2="100" y1={height * g} y2={height * g} stroke="currentColor" strokeOpacity="0.07" strokeDasharray="1.5 2" />
        ))}
        {data.map((v, i) => {
          const h = (v / max) * (height - 8);
          const x = i * barW * 2;
          return (
            <rect
              key={i}
              x={x}
              y={height - h}
              width={barW}
              height={h}
              rx={barW / 2}
              fill={color}
              opacity={0.85}
            />
          );
        })}
      </svg>
      {labels ? (
        <div className="mt-1.5 flex justify-between text-[10px]" style={{ color: "var(--a-mute)" }}>
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Area chart with gradient fill + faint grid. */
export function AreaChart({
  data,
  height = 160,
  stroke = GREEN,
  labels,
}: {
  data: number[];
  height?: number;
  stroke?: string;
  labels?: string[];
}) {
  const w = 100;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = w / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => [i * step, height - 6 - ((v - min) / span) * (height - 16)] as const);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");
  const area = `${line} L${w},${height} L0,${height} Z`;
  const id = `ac${Math.round(min)}${Math.round(max)}${data.length}`;
  return (
    <div>
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={w} y1={height * g} y2={height * g} stroke="currentColor" strokeOpacity="0.07" strokeDasharray="1.5 2" />
        ))}
        <path d={area} fill={`url(#${id})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {labels ? (
        <div className="mt-1.5 flex justify-between text-[10px]" style={{ color: "var(--a-mute)" }}>
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Small radar / spider chart. */
export function MiniRadar({
  axes,
  size = 190,
}: {
  axes: { label: string; value: number }[];
  size?: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 26;
  const n = axes.length;
  const point = (i: number, radius: number) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + Math.cos(ang) * radius, cy + Math.sin(ang) * radius] as const;
  };
  const rings = [0.33, 0.66, 1];
  const shape = axes
    .map((a, i) => {
      const p = point(i, r * Math.max(0, Math.min(1, a.value / 100)));
      return `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    })
    .join(" ") + " Z";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings.map((rr, i) => (
        <polygon
          key={i}
          points={axes.map((_, j) => point(j, r * rr).join(",")).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.09"
        />
      ))}
      {axes.map((_, i) => {
        const p = point(i, r);
        return <line key={i} x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke="currentColor" strokeOpacity="0.08" />;
      })}
      <path d={shape} fill={GREEN} fillOpacity="0.16" stroke={GREEN} strokeWidth="1.4" />
      {axes.map((a, i) => {
        const p = point(i, r + 14);
        return (
          <text key={i} x={p[0]} y={p[1]} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="currentColor" fillOpacity="0.55">
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}
