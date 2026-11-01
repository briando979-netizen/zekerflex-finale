import { prisma } from "@/lib/prisma";
import { dueDateOf } from "@/lib/billing/reminders";
import { bucketSum, deltaPct, timelineKeys, resolvePeriod, type Period } from "@/lib/admin/period";
import { moneyRows, sumOf } from "@/lib/admin/insights/common";

// De cijfers achter Admin → Financiën en Admin → Facturen.

const DAY = 86_400_000;

/** Eigen omzet per maand, per bron: de laatste 12 maanden. */
export async function revenueByMonth() {
  const period = resolvePeriod("365");
  const rows = await moneyRows(new Date(period.to.getTime() - 400 * DAY), period.to);
  const series = (source: string) => bucketSum(rows.filter((r) => r.source === source), (r) => r.at, (r) => r.marginCents, period);
  return {
    labels: timelineKeys(period),
    platformfee: series("platformfee"),
    uitzend: series("uitzend"),
    shop: series("shop"),
  };
}

export const AGE_BUCKETS = ["Nog niet vervallen", "1 tot 7 dagen te laat", "8 tot 14 dagen te laat", "15 tot 30 dagen te laat", "Meer dan 30 dagen te laat"] as const;

function ageBucket(daysLate: number): number {
  if (daysLate <= 0) return 0;
  if (daysLate <= 7) return 1;
  if (daysLate <= 14) return 2;
  if (daysLate <= 30) return 3;
  return 4;
}

export async function invoicesInsights(period: Period, now = new Date()) {
  const invoices = await prisma.invoice.findMany({
    select: {
      id: true,
      number: true,
      type: true,
      status: true,
      totalCents: true,
      createdAt: true,
      issuedAt: true,
      paidAt: true,
      dueAt: true,
      recipientTenantId: true,
      recipientFreelancerId: true,
      recipientTenant: { select: { name: true } },
      recipientFreelancer: { select: { user: { select: { fullName: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 3000,
  });

  const billable = invoices.filter((i) => i.status === "PAID" || i.status === "ISSUED");
  const inNow = billable.filter((i) => i.createdAt >= period.from);
  const inPrev = billable.filter((i) => i.createdAt >= period.prevFrom && i.createdAt < period.from);
  const open = invoices.filter((i) => i.status === "ISSUED");
  const ages = AGE_BUCKETS.map(() => 0);
  let overdueCents = 0;
  let overdueCount = 0;
  for (const inv of open) {
    const daysLate = Math.floor((now.getTime() - dueDateOf(inv).getTime()) / DAY);
    ages[ageBucket(daysLate)]! += inv.totalCents;
    if (daysLate > 0) {
      overdueCents += inv.totalCents;
      overdueCount += 1;
    }
  }
  const paidInPeriod = invoices.filter((i) => i.status === "PAID" && i.paidAt && i.paidAt >= period.from);
  const payDays = paidInPeriod.filter((i) => i.paidAt && i.issuedAt).map((i) => (i.paidAt!.getTime() - i.issuedAt!.getTime()) / DAY);
  const avgPayDays = payDays.length ? Math.round(payDays.reduce((a, b) => a + b, 0) / payDays.length) : null;

  return {
    invoices,
    labels: timelineKeys(period),
    billed: sumOf(inNow, (i) => i.totalCents),
    billedDelta: deltaPct(sumOf(inNow, (i) => i.totalCents), sumOf(inPrev, (i) => i.totalCents)),
    billedCount: inNow.length,
    paidSeries: bucketSum(inNow.filter((i) => i.status === "PAID"), (i) => i.createdAt, (i) => i.totalCents, period),
    openSeries: bucketSum(inNow.filter((i) => i.status === "ISSUED"), (i) => i.createdAt, (i) => i.totalCents, period),
    openCents: sumOf(open, (i) => i.totalCents),
    openCount: open.length,
    overdueCents,
    overdueCount,
    paidCents: sumOf(paidInPeriod, (i) => i.totalCents),
    avgPayDays,
    ages,
  };
}
