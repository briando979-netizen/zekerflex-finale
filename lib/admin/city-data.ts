import { prisma } from "@/lib/prisma";
import { amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";
import { COMPANY_SLOTS } from "@/lib/admin/city-layout";

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
  serverTime: string;
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
    serverTime: now.toISOString(),
  };
}
