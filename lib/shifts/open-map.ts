import { ShiftStatus, ShiftVisibility } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Geaggregeerde data voor de publieke "waar is er werk"-kaart. We tonen open
// marktplaats-diensten gegroepeerd per plaats (nooit de werkgever of het exacte
// adres — privacy), met een korte KV-cache zodat een publieke pagina de DB niet
// bij elke bezoeker raakt.
// ---------------------------------------------------------------------------

export interface MapCity {
  city: string;
  lat: number;
  lng: number;
  count: number; // open diensten in deze plaats
  minRateCents: number;
  maxRateCents: number;
  sampleTitles: string[];
}

export interface OpenShiftMap {
  cities: MapCity[];
  totalShifts: number;
  totalCities: number;
  generatedAt: string;
}

const OPEN_STATUSES: ShiftStatus[] = [ShiftStatus.OPEN, ShiftStatus.MATCHING, ShiftStatus.PARTIALLY_FILLED];
const CACHE_KEY = "open-shift-map:v1";
const CACHE_TTL_MS = 180_000; // 3 min

async function compute(): Promise<OpenShiftMap> {
  const shifts = await prisma.shift.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      visibility: ShiftVisibility.PUBLIC,
      startsAt: { gte: new Date() },
    },
    select: {
      title: true,
      hourlyRateCents: true,
      branch: { select: { city: true, latitude: true, longitude: true } },
    },
    take: 3000,
    orderBy: { startsAt: "asc" },
  });

  interface Agg { name: string; latSum: number; lngSum: number; count: number; min: number; max: number; titles: string[] }
  const byCity = new Map<string, Agg>();
  for (const s of shifts) {
    const city = (s.branch?.city ?? "").trim();
    if (!city || s.branch == null) continue;
    const key = city.toLowerCase();
    let g = byCity.get(key);
    if (!g) {
      g = { name: city, latSum: 0, lngSum: 0, count: 0, min: Number.POSITIVE_INFINITY, max: 0, titles: [] };
      byCity.set(key, g);
    }
    g.latSum += s.branch.latitude;
    g.lngSum += s.branch.longitude;
    g.count += 1;
    g.min = Math.min(g.min, s.hourlyRateCents);
    g.max = Math.max(g.max, s.hourlyRateCents);
    if (g.titles.length < 4 && !g.titles.includes(s.title)) g.titles.push(s.title);
  }

  const cities: MapCity[] = [...byCity.values()]
    .map((g) => ({
      city: g.name,
      lat: g.latSum / g.count,
      lng: g.lngSum / g.count,
      count: g.count,
      minRateCents: Number.isFinite(g.min) ? g.min : 0,
      maxRateCents: g.max,
      sampleTitles: g.titles,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    cities,
    totalShifts: shifts.length,
    totalCities: cities.length,
    generatedAt: new Date().toISOString(),
  };
}

export async function getOpenShiftMap(): Promise<OpenShiftMap> {
  const cached = await kvGet<{ at: number; data: OpenShiftMap }>(CACHE_KEY).catch(() => null);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  const data = await compute();
  await kvSet(CACHE_KEY, { at: Date.now(), data }).catch(() => undefined);
  return data;
}
