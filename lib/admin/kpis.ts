import { prisma } from "@/lib/prisma";

// 7-day daily series for the admin KPI strip. Read-only.

export interface Kpi {
  key: string;
  label: string;
  series: number[]; // 7 values, oldest → newest
  total: number; // sum over the window
  deltaPct: number | null; // this week vs previous week
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function bucketByDay(dates: Date[], days: number): number[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(dayKey(d));
  }
  const counts = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const d of dates) {
    const k = dayKey(d);
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return keys.map((k) => counts.get(k) ?? 0);
}

async function prevWeekTotal(count: () => Promise<number>): Promise<number> {
  return count();
}

export async function getKpis(): Promise<Kpi[]> {
  const now = Date.now();
  const wk = 7 * 24 * 3600 * 1000;
  const since14 = new Date(now - 14 * wk / 7);
  const weekAgo = new Date(now - wk);
  const twoWeeksAgo = new Date(now - 2 * wk);

  const [signups, assignments, payments, invoicesPaid, prevSignups, prevAssignments, prevPaid] = await Promise.all([
    prisma.user.findMany({ where: { createdAt: { gte: since14 } }, select: { createdAt: true } }),
    prisma.shiftAssignment.findMany({ where: { acceptedAt: { gte: since14 }, cancelledAt: null }, select: { acceptedAt: true } }),
    prisma.payment.findMany({ where: { status: "SETTLED", settledAt: { gte: since14 } }, select: { settledAt: true, amountCents: true } }),
    prisma.invoice.findMany({ where: { status: "PAID", createdAt: { gte: since14 } }, select: { createdAt: true, totalCents: true } }),
    prisma.user.count({ where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    prisma.shiftAssignment.count({ where: { acceptedAt: { gte: twoWeeksAgo, lt: weekAgo }, cancelledAt: null } }),
    prisma.payment.aggregate({ _sum: { amountCents: true }, where: { status: "SETTLED", settledAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
  ]);

  const delta = (thisWk: number, prevWk: number): number | null =>
    prevWk === 0 ? (thisWk > 0 ? 100 : null) : Math.round(((thisWk - prevWk) / prevWk) * 100);

  const signupSeries = bucketByDay(signups.map((s) => s.createdAt), 7);
  const assignSeries = bucketByDay(assignments.map((a) => a.acceptedAt), 7);
  const payoutDates: Date[] = payments.flatMap((p) => (p.settledAt ? [p.settledAt] : []));
  const payoutSeries = bucketByDay(payoutDates, 7);
  const payoutAmt = payments.filter((p) => p.settledAt && p.settledAt.getTime() >= now - wk).reduce((s, p) => s + p.amountCents, 0);
  const prevPaidAmt = prevPaid._sum.amountCents ?? 0;

  const feeThisWk = invoicesPaid
    .filter((i) => i.createdAt.getTime() >= now - wk)
    .reduce((s, i) => s + i.totalCents, 0);

  return [
    {
      key: "signups",
      label: "Nieuwe aanmeldingen",
      series: signupSeries,
      total: signupSeries.reduce((a, b) => a + b, 0),
      deltaPct: delta(signupSeries.reduce((a, b) => a + b, 0), prevSignups),
    },
    {
      key: "shifts",
      label: "Diensten aangenomen",
      series: assignSeries,
      total: assignSeries.reduce((a, b) => a + b, 0),
      deltaPct: delta(assignSeries.reduce((a, b) => a + b, 0), prevAssignments),
    },
    {
      key: "payouts",
      label: "Uitbetaald (7d)",
      series: payoutSeries.map((n) => n),
      total: Math.round(payoutAmt / 100),
      deltaPct: delta(payoutAmt, prevPaidAmt),
    },
    {
      key: "revenue",
      label: "Facturatie (7d)",
      series: payoutSeries,
      total: Math.round(feeThisWk / 100),
      deltaPct: null,
    },
  ];
}
