import { CITIES } from "@/lib/seo-cities";

// ---------------------------------------------------------------------------
// Calm background for the hero: the Netherlands as a field of dots, with a
// soft pulse lighting up city after city — "klussen in heel Nederland",
// told without a word. Pure SVG + CSS (no JS), sits still for
// prefers-reduced-motion (see .map-pulse in globals.css).
// ---------------------------------------------------------------------------

// Rough outline of the Netherlands (lng, lat) — only used to place the dots.
const NL: [number, number][] = [
  [3.36, 51.37], [3.9, 51.21], [4.4, 51.36], [5.0, 51.48], [5.85, 51.15], [5.65, 50.76], [6.0, 50.76], [6.08, 51.0],
  [6.2, 51.36], [5.95, 51.73], [6.75, 51.9], [7.06, 52.23], [6.7, 52.5], [7.08, 52.62], [7.2, 53.24], [6.9, 53.45],
  [6.2, 53.42], [5.6, 53.38], [4.85, 53.22], [4.7, 52.9], [4.55, 52.45], [4.35, 52.15], [4.0, 51.98], [3.6, 51.8],
];
const LNG0 = 3.25, LNG1 = 7.3, LAT0 = 50.7, LAT1 = 53.6;
const W = 83, H = 100;
const px = (lng: number) => ((lng - LNG0) / (LNG1 - LNG0)) * W;
const py = (lat: number) => ((LAT1 - lat) / (LAT1 - LAT0)) * H;

function inside(lng: number, lat: number): boolean {
  let hit = false;
  for (let i = 0, j = NL.length - 1; i < NL.length; j = i++) {
    const [xi, yi] = NL[i]!;
    const [xj, yj] = NL[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const DOTS: [number, number][] = [];
for (let lat = LAT0; lat <= LAT1; lat += 0.075) {
  for (let lng = LNG0; lng <= LNG1; lng += 0.11) if (inside(lng, lat)) DOTS.push([px(lng), py(lat)]);
}

export function HeroMap({ className = "" }: { className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`map-pulse ${className}`} aria-hidden focusable="false">
      {DOTS.map(([x, y], i) => (
        <circle key={i} cx={x.toFixed(2)} cy={y.toFixed(2)} r="0.34" fill="currentColor" opacity="0.22" />
      ))}
      {CITIES.map((c, i) => {
        const x = px(c.lng).toFixed(2);
        const y = py(c.lat).toFixed(2);
        const delay = `${((i * 1.37) % 9).toFixed(2)}s`;
        return (
          <g key={c.slug}>
            <circle cx={x} cy={y} r="0.8" className="map-dot" style={{ animationDelay: delay }} />
            <circle cx={x} cy={y} r="0.8" className="map-ring" style={{ animationDelay: delay }} />
          </g>
        );
      })}
    </svg>
  );
}
