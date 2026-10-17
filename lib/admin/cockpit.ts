import { prisma } from "@/lib/prisma";
import { platformAccount } from "@/lib/bank/accounts";

// ---------------------------------------------------------------------------
// Admin cockpit: the numbers that say how ZekerFlex is doing, live from the
// database. Revenue = what ZekerFlex itself earns (platform-fee and uitzend
// invoices, plus bank income booked on the platform account); volume (GMV) =
// every invoice issued through the platform. Forecast = simple run-rate.
// ---------------------------------------------------------------------------

const REVENUE_TYPES = ["PLATFORM_FEE", "UITZEND_FEE"] as const;

function monthStart(d: Date, offset = 0) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1));
}
const growth = (now: number, before: number) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

export interface Cockpit {
  generatedAt: string;
  revenue: { thisMonthCents: number; lastMonthCents: number; growthPct: number | null; runRateMonthCents: number; arrCents: number };
  gmv: { thisMonthCents: number; lastMonthCents: number; growthPct: number | null };
  bankIncome: { thisMonthCents: number };
  users: { total: number; freelancers: number; newThisMonth: number; newLastMonth: number; active7d: number; growthPct: number | null };
  companies: { total: number; newThisMonth: number };
  shifts: { thisMonth: number; filledThisMonth: number; fillRatePct: number; upcoming: number };
  bank: { accounts: number; customerCents: number; potsCents: number; cards: number; platformCents: number };
  daily: { day: string; revenueCents: number; gmvCents: number }[];
  topCompanies: { name: string; gmvCents: number }[];
}

export async function buildCockpit(now = new Date()): Promise<Cockpit> {
  const m0 = monthStart(now);
  const m1 = monthStart(now, -1);
  const d30 = new Date(now.getTime() - 29 * 86_400_000);
  d30.setUTCHours(0, 0, 0, 0);
  const platform = await platformAccount();

  const invoiceSum = (from: Date, to: Date, revenueOnly: boolean) =>
    prisma.invoice.aggregate({
      where: { status: { in: ["ISSUED", "PAID"] }, createdAt: { gte: from, lt: to }, ...(revenueOnly ? { type: { in: [...REVENUE_TYPES] } } : {}) },
      _sum: { subtotalCents: true, totalCents: true },
    });

  const [revNow, revBefore, gmvNow, gmvBefore, bankIncome, users, freelancers, usersNow, usersBefore, active7d, companies, companiesNow, shiftsNow, filledNow, upcoming, accounts, balances, pots, cards, daily, top] =
    await Promise.all([
      invoiceSum(m0, now, true),
      invoiceSum(m1, m0, true),
      invoiceSum(m0, now, false),
      invoiceSum(m1, m0, false),
      prisma.bankEntry.aggregate({ where: { accountId: platform.id, amountCents: { gt: 0 }, createdAt: { gte: m0 } }, _sum: { amountCents: true } }),
      prisma.user.count(),
      prisma.freelancerProfile.count(),
      prisma.user.count({ where: { createdAt: { gte: m0 } } }),
      prisma.user.count({ where: { createdAt: { gte: m1, lt: m0 } } }),
      prisma.user.count({ where: { lastLoginAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } } }),
      prisma.tenant.count({ where: { type: { not: "PLATFORM" } } }),
      prisma.tenant.count({ where: { type: { not: "PLATFORM" }, createdAt: { gte: m0 } } }),
      prisma.shift.count({ where: { startsAt: { gte: m0, lt: monthStart(now, 1) } } }),
      prisma.shift.count({ where: { startsAt: { gte: m0, lt: monthStart(now, 1) }, assignments: { some: { cancelledAt: null } } } }),
      prisma.shift.count({ where: { startsAt: { gte: now } } }),
      prisma.bankAccount.count({ where: { ownerType: { not: "PLATFORM" } } }),
      prisma.bankAccount.aggregate({ where: { ownerType: { not: "PLATFORM" } }, _sum: { balanceCents: true } }),
      prisma.bankPot.aggregate({ where: { closedAt: null }, _sum: { balanceCents: true } }),
      prisma.bankCard.count({ where: { status: { not: "canceled" } } }),
      prisma.invoice.findMany({ where: { status: { in: ["ISSUED", "PAID"] }, createdAt: { gte: d30 } }, select: { type: true, subtotalCents: true, totalCents: true, createdAt: true }, take: 50_000 }),
      prisma.invoice.groupBy({ by: ["recipientTenantId"], where: { status: { in: ["ISSUED", "PAID"] }, createdAt: { gte: m0 }, recipientTenantId: { not: null } }, _sum: { totalCents: true }, orderBy: { _sum: { totalCents: "desc" } }, take: 5 }),
    ]);

  const days = new Map<string, { revenueCents: number; gmvCents: number }>();
  for (let i = 0; i < 30; i++) days.set(new Date(d30.getTime() + i * 86_400_000).toISOString().slice(0, 10), { revenueCents: 0, gmvCents: 0 });
  for (const inv of daily) {
    const d = days.get(inv.createdAt.toISOString().slice(0, 10));
    if (!d) continue;
    d.gmvCents += inv.totalCents;
    if ((REVENUE_TYPES as readonly string[]).includes(inv.type)) d.revenueCents += inv.subtotalCents;
  }
  const names = await prisma.tenant.findMany({ where: { id: { in: top.map((t) => t.recipientTenantId!).filter(Boolean) } }, select: { id: true, name: true } });

  const revenueNow = (revNow._sum.subtotalCents ?? 0) + (bankIncome._sum.amountCents ?? 0);
  const revenueBefore = revBefore._sum.subtotalCents ?? 0;
  const dayOfMonth = now.getUTCDate() - 1 + now.getUTCHours() / 24;
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const runRate = dayOfMonth > 0.5 ? Math.round((revenueNow / dayOfMonth) * daysInMonth) : revenueNow;

  return {
    generatedAt: now.toISOString(),
    revenue: { thisMonthCents: revenueNow, lastMonthCents: revenueBefore, growthPct: growth(revenueNow, revenueBefore), runRateMonthCents: runRate, arrCents: runRate * 12 },
    gmv: { thisMonthCents: gmvNow._sum.totalCents ?? 0, lastMonthCents: gmvBefore._sum.totalCents ?? 0, growthPct: growth(gmvNow._sum.totalCents ?? 0, gmvBefore._sum.totalCents ?? 0) },
    bankIncome: { thisMonthCents: bankIncome._sum.amountCents ?? 0 },
    users: { total: users, freelancers, newThisMonth: usersNow, newLastMonth: usersBefore, active7d, growthPct: growth(usersNow, usersBefore) },
    companies: { total: companies, newThisMonth: companiesNow },
    shifts: { thisMonth: shiftsNow, filledThisMonth: filledNow, fillRatePct: shiftsNow ? Math.round((filledNow / shiftsNow) * 100) : 0, upcoming },
    bank: { accounts, customerCents: balances._sum.balanceCents ?? 0, potsCents: pots._sum.balanceCents ?? 0, cards, platformCents: platform.balanceCents },
    daily: [...days].map(([day, v]) => ({ day, ...v })),
    topCompanies: top.map((t) => ({ name: names.find((n) => n.id === t.recipientTenantId)?.name ?? "—", gmvCents: t._sum.totalCents ?? 0 })),
  };
}
