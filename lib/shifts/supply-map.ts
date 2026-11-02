import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Waar wonen de beschikbare krachten? Voor de 3D-kaart (vraag én aanbod).
// Privacy eerst: we tellen thuisbases per vak van ~16 km en tonen een vak pas
// vanaf MIN_PER_CELL mensen, op het MIDDEN van het vak (nooit iemands echte
// locatie, nooit een postcode). Kort gecachet.
// ---------------------------------------------------------------------------

export const CELL_LAT = 0.15;
export const CELL_LNG = 0.25;
export const MIN_PER_CELL = 3;
const CACHE_KEY = "supply-map:v1";
const CACHE_TTL_MS = 10 * 60_000;

export interface SupplyCell {
  lat: number;
  lng: number;
  count: number;
}

export interface SupplyMap {
  cells: SupplyCell[];
  /** mensen in vakken met minstens MIN_PER_CELL (de rest telt niet mee) */
  shown: number;
  generatedAt: string;
}

/** Puur: thuisbases → vakken, met de k-anonimiteitsdrempel. */
export function aggregateSupply(points: { lat: number; lng: number }[], min = MIN_PER_CELL): SupplyCell[] {
  const cells = new Map<string, { i: number; j: number; count: number }>();
  for (const p of points) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng) || (p.lat === 0 && p.lng === 0)) continue;
    const i = Math.floor(p.lat / CELL_LAT);
    const j = Math.floor(p.lng / CELL_LNG);
    const key = `${i}:${j}`;
    const c = cells.get(key) ?? { i, j, count: 0 };
    c.count += 1;
    cells.set(key, c);
  }
  const round = (n: number) => Math.round(n * 1000) / 1000;
  return [...cells.values()]
    .filter((c) => c.count >= min)
    .map((c) => ({ lat: round((c.i + 0.5) * CELL_LAT), lng: round((c.j + 0.5) * CELL_LNG), count: c.count }))
    .sort((a, b) => b.count - a.count);
}

export async function getSupplyMap(): Promise<SupplyMap> {
  const cached = await kvGet<{ at: number; data: SupplyMap }>(CACHE_KEY).catch(() => null);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  const rows = await prisma.freelancerProfile.findMany({
    where: { country: "NL" },
    select: { homeLatitude: true, homeLongitude: true },
    take: 50_000,
  });
  const cells = aggregateSupply(rows.map((r) => ({ lat: r.homeLatitude, lng: r.homeLongitude })));
  const data: SupplyMap = { cells, shown: cells.reduce((s, c) => s + c.count, 0), generatedAt: new Date().toISOString() };
  await kvSet(CACHE_KEY, { at: Date.now(), data }).catch(() => undefined);
  return data;
}
