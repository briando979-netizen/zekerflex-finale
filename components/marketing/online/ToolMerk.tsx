import { merkVan } from "@/lib/marketing/online-merken";

// Het eigen logo van een online tool (/online): een tegel met kleurverloop en een witte vorm, getekend uit
// lib/marketing/online-merken.ts. Servercomponent, geen JavaScript. `maat` in pixels (de tegel is vierkant).
export function ToolMerk({ sleutel, maat = 48, className = "" }: { sleutel: string; maat?: number; className?: string }) {
  const m = merkVan(sleutel);
  const id = `merk-${sleutel}-${maat}`;
  return (
    <svg
      width={maat}
      height={maat}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      style={{ filter: "drop-shadow(0 6px 14px rgba(12,14,18,0.18))" }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={m.van} />
          <stop offset="1" stopColor={m.naar} />
        </linearGradient>
        <linearGradient id={`${id}-glans`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="46" height="46" rx="13" fill={`url(#${id})`} />
      <rect x="1" y="1" width="46" height="23" rx="13" fill={`url(#${id}-glans)`} />
      <g transform="translate(9 9) scale(1.25)" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {m.paden.map((d) => (
          <path key={d} d={d} />
        ))}
        {(m.punten ?? []).map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="#fff" stroke="none" />
        ))}
      </g>
    </svg>
  );
}
