"use client";

/**
 * Tiny sovereign "map": home at centre, shifts as dots positioned by their
 * bearing + distance (log-scaled). No tiles, no external service. Click a dot
 * to open the shift.
 */
import { useRouter } from "next/navigation";

interface Pt {
  id: string;
  lat: number;
  lng: number;
  score: number;
  label: string;
  km: number;
}

export function ShiftMiniMap({
  home,
  points,
  height = 320,
  onPick,
}: {
  home: { lat: number; lng: number };
  points: Pt[];
  height?: number;
  onPick?: (id: string) => void;
}) {
  const router = useRouter();
  const size = 100;
  const cx = size / 2;
  const cy = size / 2;
  const maxKm = Math.max(6, ...points.map((p) => p.km));

  const place = (p: Pt) => {
    const dLat = (p.lat - home.lat) * Math.PI / 180;
    const dLng = ((p.lng - home.lng) * Math.PI) / 180 * Math.cos((home.lat * Math.PI) / 180);
    const bearing = Math.atan2(dLng, dLat);
    const r = (Math.log(1 + p.km) / Math.log(1 + maxKm)) * (size / 2 - 8);
    return { x: cx + Math.sin(bearing) * r, y: cy - Math.cos(bearing) * r };
  };

  return (
    <div className="overflow-hidden rounded-xl border border-hair bg-paper-soft" style={{ height }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full">
        {[0.33, 0.66, 1].map((f) => (
          <circle key={f} cx={cx} cy={cy} r={(size / 2 - 8) * f} fill="none" stroke="#D6D7CF" strokeWidth="0.3" />
        ))}
        {[0.33, 0.66, 1].map((f) => (
          <text key={`t${f}`} x={cx + 1} y={cy - (size / 2 - 8) * f + 3} fontSize="2.6" fill="#8A938A" fontFamily="monospace">
            {Math.round(maxKm * f)}km
          </text>
        ))}
        {points.map((p) => {
          const { x, y } = place(p);
          const c = p.score >= 0.8 ? "#0E5C4A" : p.score >= 0.6 ? "#5FC7A8" : "#8A938A";
          return (
            <g key={p.id} style={{ cursor: "pointer" }} onClick={() => (onPick ? onPick(p.id) : router.push(`/dashboard/klussen/${p.id}`))}>
              <circle cx={x} cy={y} r="2.4" fill={c} />
              <circle cx={x} cy={y} r="4" fill={c} opacity="0.18" />
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="2.6" fill="#0C0E12" />
        <circle cx={cx} cy={cy} r="1.1" fill="#4FE0A0" />
      </svg>
    </div>
  );
}
