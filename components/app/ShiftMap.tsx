"use client";

import { useMemo, useState } from "react";

// ---------------------------------------------------------------------------
// Real map for a single location — a grid of OpenStreetMap tiles (proxied via
// /api/geo/tile so the CSP allows them) positioned so the point sits dead
// centre, with a pin on top. No map library. Falls back to a plain panel if a
// tile fails to load.
// ---------------------------------------------------------------------------

const TILE = 256;

function lngLatToTileUnits(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

export function ShiftMap({
  lat,
  lng,
  zoom = 15,
  height = 180,
  label,
}: {
  lat: number;
  lng: number;
  zoom?: number;
  height?: number;
  label?: string;
}) {
  const [failed, setFailed] = useState(false);

  const grid = useMemo(() => {
    const span = 2; // 5×5 tiles = 1280px, enough to fill any card width
    const { x, y } = lngLatToTileUnits(lat, lng, zoom);
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const n = 2 ** zoom;
    const tiles: { x: number; y: number; left: number; top: number }[] = [];
    for (let dx = -span; dx <= span; dx += 1) {
      for (let dy = -span; dy <= span; dy += 1) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
        tiles.push({ x: tx, y: ty, left: (dx + span) * TILE, top: (dy + span) * TILE });
      }
    }
    const size = (2 * span + 1) * TILE;
    // pixel offset of the point inside the grid (grid origin = tile cx-span, cy-span)
    const offX = (x - (cx - span)) * TILE;
    const offY = (y - (cy - span)) * TILE;
    return { tiles, size, offX, offY };
  }, [lat, lng, zoom]);

  if (failed || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return (
      <div
        className="grid place-items-center rounded-xl border border-hair bg-paper-soft text-xs text-neutralx-400"
        style={{ height }}
      >
        Kaart niet beschikbaar
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-hair bg-paper-soft"
      style={{ height }}
    >
      <div
        className="absolute"
        style={{
          width: grid.size,
          height: grid.size,
          left: "50%",
          top: "50%",
          transform: `translate(${-grid.offX}px, ${-grid.offY}px)`,
        }}
      >
        {grid.tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${t.x}-${t.y}`}
            src={`/api/geo/tile?z=${zoom}&x=${t.x}&y=${t.y}`}
            alt=""
            width={TILE}
            height={TILE}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            className="absolute max-w-none select-none"
            style={{ left: t.left, top: t.top, width: TILE, height: TILE }}
          />
        ))}
      </div>

      {/* pin, anchored to its tip at the exact centre */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full drop-shadow">
        <svg width="30" height="38" viewBox="0 0 30 38" fill="none" aria-hidden>
          <path
            d="M15 37S27 22.5 27 13.5C27 6.6 21.6 1 15 1S3 6.6 3 13.5C3 22.5 15 37 15 37Z"
            fill="#E5484D"
            stroke="#fff"
            strokeWidth="2"
          />
          <circle cx="15" cy="13.5" r="4.5" fill="#fff" />
        </svg>
      </div>

      {label && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-ink/65 to-transparent px-3 pb-1.5 pt-7 text-xs font-semibold text-white">
          {label}
        </div>
      )}
      <span className="absolute bottom-0.5 right-1 rounded bg-white/75 px-1 text-[9px] leading-tight text-neutralx-500">
        © OpenStreetMap
      </span>
    </div>
  );
}
