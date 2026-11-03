import { prisma } from "@/lib/prisma";
import { cached, redis } from "@/lib/redis";
import { amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";
import { COMPANY_SLOTS } from "@/lib/admin/city-layout";
import { weatherKind, type WeatherKind } from "@/lib/admin/city-life";
import type { LiveVisit } from "@/lib/analytics/live";

// Cijfers achter de 3D-stad (Admin → Kantoor): wie er een pand krijgt op het
// bedrijventerrein, hoeveel huizen de woonwijk heeft, hoeveel mensen er nu aan
// het werk zijn, en wat er vandaag door het magazijn, de bank en het datacenter
// ging. Alleen tellingen; werkers komen nooit los of met naam in beeld.

export interface CityCompany {
  id: string;
  name: string;
  branches: number;
  openShifts: number;
  shiftsWeek: number;
  workingNow: number;
}

export interface CityData {
  companies: CityCompany[];
  companiesTotal: number;
  workers: { total: number; workingNow: number };
  shop: { ordersToday: number; toShip: number };
  money: { openInvoices: number; openCents: number; paidToday: number; paidTodayCents: number };
  ai: { callsToday: number };
  certificates: { total: number; pending: number };
  leads: { total: number; newToday: number };
  eventsLastHour: number;
  /** Bezoekers die nu op zekerflex.com zijn (anonieme telling uit lib/analytics/live). */
  visitors: { total: number; anoniem: number; freelancer: number; bedrijf: number };
  /** Het weer in Amsterdam nu (MET Norway); null als de bron even niet bereikbaar is. */
  weather: CityWeather | null;
  serverTime: string;
}

export interface CityWeather {
  kind: WeatherKind;
  tempC: number;
  windKmh: number;
  cloud: number;
  mmPerHour: number;
}

/** Wie er nu op de site is: alleen tellingen, nooit pagina's of ids. Valt Redis weg, dan 0. */
async function visitorsNow(now: number): Promise<CityData["visitors"]> {
  const out = { total: 0, anoniem: 0, freelancer: 0, bedrijf: 0 };
  try {
    for (const json of Object.values(await redis.hgetall("an:live"))) {
      const v = JSON.parse(json) as Partial<LiveVisit>;
      if (!v.lastSeen || now - v.lastSeen > 90_000) continue;
      out.total += 1;
      if (v.role === "freelancer") out.freelancer += 1;
      else if (v.role === "bedrijf") out.bedrijf += 1;
      else out.anoniem += 1;
    }
  } catch {
    // geen telling: de stad loopt gewoon door met alleen bewoners
  }
  return out;
}

interface MetForecast {
  properties?: {
    timeseries?: {
      data?: {
        instant?: { details?: { air_temperature?: number; cloud_area_fraction?: number; wind_speed?: number } };
        next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
      };
    }[];
  };
}

/**
 * Het weer in Amsterdam van MET Norway (vrij te gebruiken, ook zakelijk, met
 * bronvermelding; ze vragen een herkenbare User-Agent). Tien minuten bewaard,
 * ook als het mislukte, zodat een trage bron de stad niet ophoudt.
 */
async function amsterdamWeather(): Promise<CityWeather | null> {
  return cached<CityWeather | null>("city:weer", 600, async () => {
    try {
      const r = await fetch("https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=52.37&lon=4.89", {
        headers: { "User-Agent": "ZekerFlex-kantoor/1.0 (+https://zekerflex.com)", Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (!r.ok) return null;
      const now = ((await r.json()) as MetForecast).properties?.timeseries?.[0]?.data;
      const d = now?.instant?.details;
      if (!d || d.air_temperature === undefined) return null;
      const cloud = Math.round(d.cloud_area_fraction ?? 0);
      return {
        kind: weatherKind(now?.next_1_hours?.summary?.symbol_code ?? "", cloud),
        tempC: Math.round(d.air_temperature),
        windKmh: Math.round((d.wind_speed ?? 0) * 3.6),
        cloud,
        mmPerHour: now?.next_1_hours?.details?.precipitation_amount ?? 0,
      };
    } catch {
      return null;
    }
  });
}

const OPEN_SHIFT = ["OPEN", "MATCHING", "PARTIALLY_FILLED"] as const;
const ROWS = 5000;

/** Klanten met een pand: de drukste eerst (nu aan het werk, open diensten, deze week, vestigingen). */
export function rankCompanies(list: CityCompany[]): CityCompany[] {
  return [...list]
    .sort((a, b) => b.workingNow - a.workingNow || b.openShifts - a.openShifts || b.shiftsWeek - a.shiftsWeek || b.branches - a.branches || a.name.localeCompare(b.name, "nl"))
    .slice(0, COMPANY_SLOTS.length);
}

export async function getCityData(now = new Date()): Promise<CityData> {
  const p = amsterdamParts(now);
  const dayStart = amsterdamToUtc(p.year, p.month, p.day);
  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);
  const hourAgo = new Date(now.getTime() - 3_600_000);

  // tegelijk met de database-vragen, zodat het weer de stad niet ophoudt
  const extras = Promise.all([visitorsNow(now.getTime()), amsterdamWeather().catch(() => null)]);
  const [tenants, open, week, working, workers, ordersToday, toShip, openInv, paidInv, aiCalls, certTotal, certPending, leads, leadsToday, eventsLastHour] = await Promise.all([
    prisma.tenant.findMany({ where: { type: { not: "PLATFORM" } }, select: { id: true, name: true, _count: { select: { branches: true } } }, take: ROWS }),
    prisma.shift.findMany({ where: { status: { in: [...OPEN_SHIFT] }, endsAt: { gte: now } }, select: { branch: { select: { tenantId: true } } }, take: ROWS }),
    prisma.shift.findMany({ where: { startsAt: { gte: now, lte: weekEnd }, status: { notIn: ["DRAFT", "CANCELLED"] } }, select: { branch: { select: { tenantId: true } } }, take: ROWS }),
    prisma.shiftAssignment.findMany({
      where: { cancelledAt: null, shift: { startsAt: { lte: now }, endsAt: { gte: now }, status: { not: "CANCELLED" } } },
      select: { shift: { select: { branch: { select: { tenantId: true } } } } },
      take: ROWS,
    }),
    prisma.freelancerProfile.count(),
    prisma.shopOrder.count({ where: { createdAt: { gte: dayStart }, status: { in: ["RECEIVED", "CONFIRMED", "SHIPPED"] } } }),
    prisma.shopOrder.count({ where: { status: { in: ["RECEIVED", "CONFIRMED"] } } }),
    prisma.invoice.aggregate({ where: { status: "ISSUED" }, _count: true, _sum: { totalCents: true } }),
    prisma.invoice.aggregate({ where: { status: "PAID", paidAt: { gte: dayStart } }, _count: true, _sum: { totalCents: true } }),
    prisma.aiUsageLog.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.certificate.count(),
    prisma.certificate.count({ where: { status: "PENDING" } }),
    prisma.salesLead.count(),
    prisma.salesLead.count({ where: { createdAt: { gte: dayStart } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: hourAgo }, NOT: { action: { startsWith: "auth." } } } }),
  ]);

  const [visitors, weather] = await extras;
  const tally = (rows: { tenantId: string }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.tenantId, (m.get(r.tenantId) ?? 0) + 1);
    return m;
  };
  const openBy = tally(open.map((s) => s.branch));
  const weekBy = tally(week.map((s) => s.branch));
  const workingBy = tally(working.map((a) => a.shift.branch));

  const all: CityCompany[] = tenants.map((t) => ({
    id: t.id,
    name: t.name,
    branches: t._count.branches,
    openShifts: openBy.get(t.id) ?? 0,
    shiftsWeek: weekBy.get(t.id) ?? 0,
    workingNow: workingBy.get(t.id) ?? 0,
  }));

  return {
    companies: rankCompanies(all),
    companiesTotal: all.length,
    workers: { total: workers, workingNow: working.length },
    shop: { ordersToday, toShip },
    money: { openInvoices: openInv._count, openCents: openInv._sum.totalCents ?? 0, paidToday: paidInv._count, paidTodayCents: paidInv._sum.totalCents ?? 0 },
    ai: { callsToday: aiCalls },
    certificates: { total: certTotal, pending: certPending },
    leads: { total: leads, newToday: leadsToday },
    eventsLastHour,
    visitors,
    weather,
    serverTime: now.toISOString(),
  };
}
