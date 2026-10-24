import type { MapCity } from "@/lib/shifts/open-map";

// Zelf-gehoste, afhankelijkheidsvrije kaart van Nederland (geen externe tiles,
// geen tracking — past bij de soevereine opzet en de strikte CSP). Een gestileerd
// NL-silhouet met stippen per plaats; de stipgrootte = aantal open diensten
// (één kleur = één betekenis: groen = open werk), met een legenda.

const LNG_MIN = 3.3;
const LNG_MAX = 7.25;
const LAT_MIN = 50.7;
const LAT_MAX = 53.6;
const W = 340;
const H = 420;
const PAD = 16;

function project(lng: number, lat: number): [number, number] {
  const x = PAD + ((lng - LNG_MIN) / (LNG_MAX - LNG_MIN)) * (W - 2 * PAD);
  const y = PAD + ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * (H - 2 * PAD);
  return [x, y];
}

// Ruwe, herkenbare omtrek van Nederland (lng, lat), met de klok mee.
const OUTLINE: [number, number][] = [
  [4.73, 52.96], [4.55, 52.75], [4.2, 52.45], [4.05, 52.1], [4.0, 51.95],
  [3.95, 51.78], [3.5, 51.45], [3.85, 51.4], [4.24, 51.37], [4.9, 51.41],
  [5.2, 51.26], [5.8, 51.1], [5.64, 50.84], [6.02, 50.76], [6.08, 51.18],
  [6.22, 51.36], [6.17, 51.5], [6.4, 51.83], [6.86, 51.99], [6.72, 52.4],
  [7.07, 52.64], [7.21, 53.24], [6.2, 53.43], [5.6, 53.45], [5.1, 53.3],
  [4.73, 52.96],
];

export function OpenShiftsMap({ cities }: { cities: MapCity[] }) {
  const outline = OUTLINE.map(([lng, lat]) => project(lng, lat).map((n) => n.toFixed(1)).join(",")).join(" ");
  const maxCount = Math.max(1, ...cities.map((c) => c.count));
  const labelled = new Set(cities.slice(0, 8).map((c) => c.city));

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mx-auto h-auto w-full max-w-sm"
        role="img"
        aria-label={`Kaart van Nederland met open diensten in ${cities.length} plaatsen`}
      >
        {/* landmassa */}
        <polygon
          points={outline}
          style={{ fill: "rgb(var(--brand-500-rgb) / 0.08)", stroke: "rgb(var(--brand-500-rgb) / 0.35)" }}
          strokeWidth={1.2}
          strokeLinejoin="round"
        />
        {/* stippen per plaats */}
        {cities.map((c) => {
          const [x, y] = project(c.lng, c.lat);
          const r = 3 + Math.sqrt(c.count / maxCount) * 13;
          return (
            <g key={c.city}>
              <circle cx={x} cy={y} r={r} style={{ fill: "rgb(var(--brand-500-rgb) / 0.22)" }} />
              <circle cx={x} cy={y} r={Math.max(2.4, r * 0.5)} style={{ fill: "rgb(var(--brand-500-rgb))" }}>
                <title>{`${c.city} — ${c.count} open ${c.count === 1 ? "dienst" : "diensten"}`}</title>
              </circle>
              {labelled.has(c.city) && (
                <text
                  x={x}
                  y={y - r - 3}
                  textAnchor="middle"
                  className="fill-neutralx-600"
                  style={{ fontSize: 9, fontWeight: 600 }}
                >
                  {c.city}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-3 flex items-center justify-center gap-2 text-xs text-neutralx-500">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "rgb(var(--brand-500-rgb))" }} />
        Grootte van de stip = aantal open diensten in die plaats
      </figcaption>
    </figure>
  );
}
