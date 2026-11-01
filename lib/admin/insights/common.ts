import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getFinanceSettings } from "@/lib/admin/finance-settings";
import { bucketSum, safe, timelineKeys, type Period } from "@/lib/admin/period";

// ---------------------------------------------------------------------------
// Cijfers die op meer dashboards terugkomen. Eén berekening, zodat een bedrag op
// het Controlecentrum hetzelfde is als op de pagina erachter.
// ---------------------------------------------------------------------------

const PAID_ORDER = ["RECEIVED", "CONFIRMED", "SHIPPED"] as const;

export interface MoneyRow {
  at: Date;
  /** Wat ZekerFlex zelf verdient, zonder btw en zonder doorlopend loon. */
  marginCents: number;
  /** Alles wat door het platform stroomt, inclusief doorloop en btw. */
  grossCents: number;
  source: "platformfee" | "uitzend" | "shop" | "doorloop";
}

/** Dezelfde regels als lib/admin/finance.ts: alleen de opslag op uitzendfacturen is marge. */
export async function moneyRows(from: Date, to: Date): Promise<MoneyRow[]> {
  const settings = await getFinanceSettings();
  const markup = settings.uitzendMarkupRate ?? env.UITZEND_MARKUP_RATE;
  const [invoices, orders] = await Promise.all([
    safe(
      () =>
        prisma.invoice.findMany({
          where: { status: { in: ["PAID", "ISSUED"] }, createdAt: { gte: from, lt: to } },
          select: { type: true, subtotalCents: true, totalCents: true, createdAt: true },
          take: 50_000,
        }),
      [],
    ),
    safe(
      () =>
        prisma.shopOrder.findMany({
          where: { status: { in: [...PAID_ORDER] }, createdAt: { gte: from, lt: to } },
          select: { subtotalCents: true, totalCents: true, createdAt: true },
          take: 50_000,
        }),
      [],
    ),
  ]);
  const rows: MoneyRow[] = invoices.map((inv) => {
    if (inv.type === "PLATFORM_FEE") return { at: inv.createdAt, marginCents: inv.subtotalCents, grossCents: inv.totalCents, source: "platformfee" };
    if (inv.type === "UITZEND_FEE") {
      const margin = markup > 0 ? Math.round((inv.subtotalCents * markup) / (1 + markup)) : 0;
      return { at: inv.createdAt, marginCents: margin, grossCents: inv.totalCents, source: "uitzend" };
    }
    return { at: inv.createdAt, marginCents: 0, grossCents: inv.totalCents, source: "doorloop" };
  });
  for (const order of orders) rows.push({ at: order.createdAt, marginCents: order.subtotalCents, grossCents: order.totalCents, source: "shop" });
  return rows;
}

export const sumOf = <T>(rows: readonly T[], value: (row: T) => number): number => rows.reduce((total, row) => total + value(row), 0);

/** Unieke bezoekers per dag of maand, plus het totaal over de hele periode. */
export async function visitorSeries(period: Period): Promise<{ series: number[]; total: number; previous: number }> {
  const format = period.bucket === "month" ? "YYYY-MM" : "YYYY-MM-DD";
  const keys = timelineKeys(period);
  const [rows, totals] = await Promise.all([
    safe(
      () => prisma.$queryRaw<{ bucket: string; visitors: bigint }[]>`
        SELECT to_char("createdAt" AT TIME ZONE 'Europe/Amsterdam', ${format}) AS bucket, count(DISTINCT "sessionId") AS visitors
        FROM "AnalyticsEvent"
        WHERE type = 'PAGEVIEW' AND "createdAt" >= ${period.bucket === "month" ? new Date(period.to.getTime() - 366 * 86_400_000) : period.from}
        GROUP BY 1`,
      [],
    ),
    safe(
      () => prisma.$queryRaw<{ current: bigint; previous: bigint }[]>`
        SELECT count(DISTINCT "sessionId") FILTER (WHERE "createdAt" >= ${period.from}) AS current,
               count(DISTINCT "sessionId") FILTER (WHERE "createdAt" < ${period.from}) AS previous
        FROM "AnalyticsEvent"
        WHERE type = 'PAGEVIEW' AND "createdAt" >= ${period.prevFrom}`,
      [],
    ),
  ]);
  const byKey = new Map(rows.map((r) => [r.bucket, Number(r.visitors)]));
  return {
    series: keys.map((k) => byKey.get(k) ?? 0),
    total: Number(totals[0]?.current ?? 0),
    previous: Number(totals[0]?.previous ?? 0),
  };
}

export { bucketSum };
