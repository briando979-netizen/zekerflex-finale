import type { BankAccount } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kvListValues } from "@/lib/storage/kv";
import { getFees, monthlyFeeFor } from "@/lib/bank/fees";
import { upcomingPremiums } from "@/lib/bank/insurance";
import { getPayoutDestination } from "@/lib/bank/earnings";
import { interestFor } from "@/lib/bank/pots";

// ---------------------------------------------------------------------------
// What the money did (income/spending per month and per category) and what
// it's about to do (the forecast): reservations, expected earnings from
// accepted shifts, fees, premiums, open invoices and maturing deposits.
// Moves to and from pots are internal and left out of income/spending.
// ---------------------------------------------------------------------------

const INTERNAL = new Set(["POT_IN", "POT_OUT"]);

export const CATEGORY: Record<string, string> = {
  TOPUP: "Opwaarderingen",
  EARNING: "Verdiensten",
  INTEREST: "Rente",
  CARD_REFUND: "Terugbetalingen",
  WITHDRAWAL_REVERSAL: "Terugboekingen",
  TRANSFER: "Overboekingen",
  ADJUSTMENT: "Correcties",
  WITHDRAWAL: "Opnames naar je bank",
  CARD_SPEND: "Pasbetalingen",
  INVOICE_PAYMENT: "Facturen",
  FEE_MONTHLY: "Bankkosten",
  FEE_CARD: "Bankkosten",
  INSURANCE_PREMIUM: "Verzekeringen",
};

export interface MonthTotals {
  month: string;
  inCents: number;
  outCents: number;
}

export interface Insights {
  months: MonthTotals[];
  categories: { label: string; cents: number }[];
  topMerchants: { name: string; cents: number; count: number }[];
  thisMonth: { inCents: number; outCents: number };
}

const monthOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export async function buildInsights(accountId: string, now = new Date()): Promise<Insights> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const entries = await prisma.bankEntry.findMany({
    where: { accountId, createdAt: { gte: since } },
    select: { amountCents: true, kind: true, counterparty: true, createdAt: true },
    take: 10_000,
  });
  const months: MonthTotals[] = [];
  for (let i = 5; i >= 0; i--) months.push({ month: monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))), inCents: 0, outCents: 0 });
  const byMonth = new Map(months.map((m) => [m.month, m]));
  const current = monthOf(now);
  const categories = new Map<string, number>();
  const merchants = new Map<string, { cents: number; count: number }>();
  for (const e of entries) {
    if (INTERNAL.has(e.kind)) continue;
    const m = byMonth.get(monthOf(e.createdAt));
    if (m) {
      if (e.amountCents > 0) m.inCents += e.amountCents;
      else m.outCents += -e.amountCents;
    }
    if (monthOf(e.createdAt) !== current || e.amountCents >= 0) continue;
    const label = CATEGORY[e.kind] ?? "Overig";
    categories.set(label, (categories.get(label) ?? 0) + -e.amountCents);
    if (e.kind === "CARD_SPEND" && e.counterparty) {
      const t = merchants.get(e.counterparty) ?? { cents: 0, count: 0 };
      merchants.set(e.counterparty, { cents: t.cents + -e.amountCents, count: t.count + 1 });
    }
  }
  const cur = byMonth.get(current)!;
  return {
    months,
    categories: [...categories].map(([label, cents]) => ({ label, cents })).sort((a, b) => b.cents - a.cents),
    topMerchants: [...merchants].map(([name, t]) => ({ name, ...t })).sort((a, b) => b.cents - a.cents).slice(0, 5),
    thisMonth: { inCents: cur.inCents, outCents: cur.outCents },
  };
}

export interface ForecastItem {
  date: string;
  label: string;
  amountCents: number;
  kind: "earning" | "fee" | "premium" | "invoice" | "deposit";
  estimate?: boolean;
}

export interface Forecast {
  reservedCents: number;
  reservations: { label: string; amountCents: number }[];
  potsCents: number;
  items: ForecastItem[];
  projectedCents: number;
  horizonDays: number;
}

export async function buildForecast(account: BankAccount, horizonDays = 30, now = new Date()): Promise<Forecast> {
  const until = new Date(now.getTime() + horizonDays * 86_400_000);
  const items: ForecastItem[] = [];

  // Reservations: card holds that haven't settled yet.
  const holds = (await kvListValues<{ accountId: string; heldCents: number }>("bank-card-hold:", 5000)).filter((h) => h.accountId === account.id && h.heldCents > 0);
  const reservations = holds.length ? [{ label: `Pasbetalingen in behandeling (${holds.length})`, amountCents: holds.reduce((s, h) => s + h.heldCents, 0) }] : [];

  // Expected earnings: accepted, upcoming shifts — only when they land here.
  if (account.userId && (await getPayoutDestination(account.userId)) === "bank") {
    const profile = await prisma.freelancerProfile.findUnique({ where: { userId: account.userId }, select: { id: true } });
    if (profile) {
      const shifts = await prisma.shiftAssignment.findMany({
        where: { freelancerId: profile.id, cancelledAt: null, shift: { startsAt: { gte: now, lte: until } } },
        select: { shift: { select: { title: true, startsAt: true, endsAt: true, hourlyRateCents: true } } },
        take: 100,
      });
      for (const { shift } of shifts) {
        const hours = (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000;
        items.push({ date: shift.endsAt.toISOString(), label: `Verwacht: ${shift.title}`, amountCents: Math.round(hours * shift.hourlyRateCents), kind: "earning", estimate: true });
      }
    }
  }

  // Monthly fee.
  const fee = monthlyFeeFor(account, await getFees());
  if (fee > 0 && account.nextFeeAt && account.nextFeeAt <= until) {
    items.push({ date: account.nextFeeAt.toISOString(), label: "Maandkosten ZekerFlex Bank", amountCents: -fee, kind: "fee" });
  }

  // Insurance premiums.
  for (const p of await upcomingPremiums(account.id, horizonDays)) items.push({ ...p, kind: "premium" });

  // Open invoices addressed to this holder.
  const where = account.tenantId ? { recipientTenantId: account.tenantId } : null;
  if (where) {
    const invoices = await prisma.invoice.findMany({ where: { ...where, status: "ISSUED" }, select: { number: true, totalCents: true, dueAt: true }, take: 50 });
    for (const inv of invoices) items.push({ date: (inv.dueAt ?? now).toISOString(), label: `Factuur ${inv.number}`, amountCents: -inv.totalCents, kind: "invoice" });
  }

  // Deposits that mature within the horizon come back with interest.
  const pots = await prisma.bankPot.findMany({ where: { accountId: account.id, closedAt: null }, select: { name: true, kind: true, balanceCents: true, lockedUntil: true, interestBps: true, termYears: true } });
  for (const p of pots) {
    if (p.kind === "FIXED" && p.lockedUntil && p.lockedUntil <= until) {
      items.push({ date: p.lockedUntil.toISOString(), label: `${p.name} komt vrij (+ rente)`, amountCents: p.balanceCents + interestFor(p.balanceCents, p.interestBps, p.termYears ?? 0), kind: "deposit" });
    }
  }

  items.sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    reservedCents: reservations.reduce((s, r) => s + r.amountCents, 0),
    reservations,
    potsCents: pots.reduce((s, p) => s + p.balanceCents, 0),
    items,
    projectedCents: account.balanceCents + items.reduce((s, i) => s + i.amountCents, 0),
    horizonDays,
  };
}
