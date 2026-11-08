/**
 * Expense Tracking Subsystem
 * Tracks costs: Stripe fees, payouts, commission deductions
 */

import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export type ExpenseCategory =
  | "STRIPE_FEES"
  | "PAYOUT_FEES"
  | "COMMISSION"
  | "TAX_WITHHOLD"
  | "TRAVEL"
  | "MEALS"
  | "SUPPLIES"
  | "EQUIPMENT"
  | "UTILITIES"
  | "OTHER";

export interface ExpenseInput {
  tenantId: string;
  category: ExpenseCategory;
  amountCents: number;
  description: string;
  taxCategory?: string;
  mileage?: number;
  receiptUrl?: string;
  date?: Date;
  referenceId?: string; // payment, invoice, etc
}

/** Record a new expense */
export async function recordExpense(input: ExpenseInput): Promise<string> {
  if (input.amountCents <= 0) {
    throw AppError.validation("Kostenpost moet positief bedrag hebben.");
  }

  const expense = await prisma.expense.create({
    data: {
      tenantId: input.tenantId,
      category: input.category,
      amountCents: input.amountCents,
      description: input.description,
      date: input.date ?? new Date(),
      taxCategory: input.taxCategory,
      mileage: input.mileage,
      receiptUrl: input.receiptUrl,
      status: "DRAFT",
    },
  });

  return expense.id;
}

/** Record platform fees from Stripe charges */
export async function recordStripeFee(
  tenantId: string,
  invoiceId: string,
  feeCents: number,
  chargeId: string,
): Promise<string> {
  return recordExpense({
    tenantId,
    category: "STRIPE_FEES",
    amountCents: feeCents,
    description: `Stripe-verwerking voor factuur ${invoiceId}`,
    date: new Date(),
    referenceId: chargeId,
  });
}

/** Record platform fee per hour on shift */
export async function recordPlatformFee(
  employerId: string,
  hours: number,
  feePerHour: number = 350, // €3.50 default
): Promise<string> {
  const feeCents = Math.round(hours * feePerHour);

  return recordExpense({
    tenantId: employerId,
    category: "COMMISSION",
    amountCents: feeCents,
    description: `Platform-commissie: ${hours} uren à €${(feePerHour / 100).toFixed(2)}`,
    date: new Date(),
  });
}

/** Record payout fee (SEPA, Stripe Connect, etc) */
export async function recordPayoutFee(
  tenantId: string,
  payoutId: string,
  feeCents: number,
  method: string = "SEPA",
): Promise<string> {
  return recordExpense({
    tenantId,
    category: "PAYOUT_FEES",
    amountCents: feeCents,
    description: `${method} uitbetaling vergoeding`,
    date: new Date(),
    referenceId: payoutId,
  });
}

/** Approve an expense for reimbursement */
export async function approveExpense(
  expenseId: string,
  approvedBy: string,
): Promise<void> {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
  });

  if (!expense) {
    throw AppError.notFound("Kostenpost niet gevonden.");
  }

  if (expense.status !== "DRAFT" && expense.status !== "SUBMITTED") {
    throw AppError.validation(
      `Kan alleen CONCEPT en INGEDIEND expenses goedkeuren. Huidigestatus: ${expense.status}`,
    );
  }

  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      status: "APPROVED",
      approvedBy,
      approvedAt: new Date(),
    },
  });
}

/** Reject an expense */
export async function rejectExpense(
  expenseId: string,
  reason: string,
): Promise<void> {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
  });

  if (!expense) {
    throw AppError.notFound("Kostenpost niet gevonden.");
  }

  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
    },
  });
}

/** Mark expense as reimbursed */
export async function markExpenseReimbursed(expenseId: string): Promise<void> {
  const expense = await prisma.expense.findUnique({
    where: { id: expenseId },
  });

  if (!expense) {
    throw AppError.notFound("Kostenpost niet gevonden.");
  }

  if (expense.status !== "APPROVED") {
    throw AppError.validation("Alleen goedgekeurde kosten kunnen terugbetaald worden.");
  }

  await prisma.expense.update({
    where: { id: expenseId },
    data: {
      status: "APPROVED",
      reimbursedAt: new Date(),
    },
  });
}

/** Get expenses for a tenant in a period */
export async function getTenantExpenses(
  tenantId: string,
  startDate: Date,
  endDate: Date,
  category?: ExpenseCategory,
) {
  return prisma.expense.findMany({
    where: {
      tenantId,
      date: {
        gte: startDate,
        lte: endDate,
      },
      ...(category && { category }),
    },
    orderBy: { date: "desc" },
  });
}

/** Calculate total expenses by category for period */
export async function getExpenseTotals(
  tenantId: string,
  startDate: Date,
  endDate: Date,
) {
  const expenses = await getTenantExpenses(tenantId, startDate, endDate);

  const byCategory = new Map<ExpenseCategory, number>();

  for (const expense of expenses) {
    const cat = expense.category as ExpenseCategory;
    const existing = byCategory.get(cat) ?? 0;
    byCategory.set(cat, existing + expense.amountCents);
  }

  return Array.from(byCategory.entries()).map(([category, total]) => ({
    category,
    totalCents: total,
    formatted: `€${(total / 100).toFixed(2)}`,
  }));
}

/** Get monthly expense breakdown */
export async function getMonthlyExpenseBreakdown(
  tenantId: string,
  year: number,
) {
  const expenses = await prisma.expense.findMany({
    where: {
      tenantId,
      date: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`),
      },
    },
  });

  const byMonth = new Map<number, Map<ExpenseCategory, number>>();

  for (const expense of expenses) {
    const month = expense.date.getMonth(); // 0-11
    const cat = expense.category as ExpenseCategory;

    if (!byMonth.has(month)) {
      byMonth.set(month, new Map());
    }
    const monthMap = byMonth.get(month)!;
    const existing = monthMap.get(cat) ?? 0;
    monthMap.set(cat, existing + expense.amountCents);
  }

  return Array.from(byMonth.entries()).map(([month, categories]) => ({
    month: month + 1,
    monthName: new Date(year, month).toLocaleString("nl-NL", {
      month: "long",
      year: "numeric",
    }),
    categories: Array.from(categories.entries()).map(([cat, total]) => ({
      category: cat,
      totalCents: total,
    })),
    totalCents: Array.from(categories.values()).reduce((a, b) => a + b, 0),
  }));
}

/** Estimate tax deductibility for an expense */
export function calculateTaxDeductibility(
  category: ExpenseCategory,
  amount: number,
): { deductible: number; nonDeductible: number } {
  // Business vs personal use ratios
  const deductibilityRates: Record<ExpenseCategory, number> = {
    STRIPE_FEES: 1.0, // 100% deductible
    PAYOUT_FEES: 1.0, // 100% deductible
    COMMISSION: 1.0, // 100% deductible
    TAX_WITHHOLD: 0.0, // not deductible (already a tax)
    TRAVEL: 0.8, // 80% deductible (personal portion)
    MEALS: 0.5, // 50% deductible (mixer rule)
    SUPPLIES: 1.0, // 100% deductible
    EQUIPMENT: 1.0, // 100% deductible
    UTILITIES: 0.6, // 60% deductible (shared with personal)
    OTHER: 0.5, // 50% default
  };

  const rate = deductibilityRates[category] ?? 0.5;
  const deductible = Math.round(amount * rate);
  const nonDeductible = amount - deductible;

  return { deductible, nonDeductible };
}
