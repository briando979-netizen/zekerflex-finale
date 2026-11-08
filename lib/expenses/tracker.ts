import { prisma } from "@/lib/prisma";
import { z } from "zod";

const expenseSchema = z.object({
  userId: z.string(),
  amountCents: z.number().int().positive(),
  category: z.enum(["TRAVEL", "MEALS", "SUPPLIES", "EQUIPMENT", "UTILITIES", "OTHER"]),
  description: z.string().min(1),
  date: z.coerce.date(),
  taxCategory: z.string().optional(),
  mileage: z.number().positive().optional(),
  receiptUrl: z.string().url().optional(),
  status: z.enum(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]).default("DRAFT"),
});

type ExpenseInput = z.infer<typeof expenseSchema>;

export async function logExpense(data: ExpenseInput) {
  const validated = expenseSchema.parse(data);

  return prisma.expense.create({
    data: {
      userId: validated.userId,
      amountCents: validated.amountCents,
      category: validated.category,
      description: validated.description,
      date: validated.date,
      taxCategory: validated.taxCategory,
      mileage: validated.mileage,
      receiptUrl: validated.receiptUrl,
      status: validated.status,
    },
  });
}

export async function submitExpenseReport(userId: string, expenseIds: string[]) {
  const expenses = await prisma.expense.updateMany({
    where: {
      id: { in: expenseIds },
      userId,
      status: "DRAFT",
    },
    data: {
      status: "SUBMITTED",
    },
  });

  return expenses;
}

export async function approveExpense(expenseId: string, approvedBy: string) {
  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      status: "APPROVED",
      approvedBy,
      approvedAt: new Date(),
    },
  });
}

export async function rejectExpense(expenseId: string, reason: string) {
  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      status: "REJECTED",
      rejectionReason: reason,
    },
  });
}

export async function calculateMileageReimbursement(mileageKm: number, ratePerKm = 0.19): Promise<number> {
  // Standard Dutch tax deduction: €0.19/km
  return Math.round(mileageKm * ratePerKm * 100);
}

export async function getTotalExpensesByCategoryAndUser(userId: string, month: Date) {
  const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);

  const totals = await prisma.expense.groupBy({
    by: ["category"],
    where: {
      userId,
      date: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
      status: "APPROVED",
    },
    _sum: {
      amountCents: true,
    },
  });

  return totals.map(t => ({
    category: t.category,
    totalCents: t._sum.amountCents ?? 0,
  }));
}

export async function getUnreimbursedExpenses(userId: string) {
  return prisma.expense.findMany({
    where: {
      userId,
      status: "APPROVED",
      reimbursedAt: null,
    },
    orderBy: { date: "asc" },
  });
}

export async function markExpenseReimbursed(expenseId: string, reimbursementDate = new Date()) {
  return prisma.expense.update({
    where: { id: expenseId },
    data: {
      reimbursedAt: reimbursementDate,
    },
  });
}
