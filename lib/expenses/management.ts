import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const expenseSchema = z.object({
  amount: z.number().positive(),
  category: z.string(),
  department: z.string(),
  description: z.string(),
  status: z.enum(['draft', 'pending', 'approved', 'rejected']),
  receipt: z.string().optional(),
});

export async function createExpense(data: z.infer<typeof expenseSchema>) {
  const validated = expenseSchema.parse(data);
  return prisma.expense.create({ data: validated });
}

export async function approveExpense(id: string, approver: string) {
  return prisma.expense.update({ where: { id }, data: { status: 'approved', approver } });
}

export async function rejectExpense(id: string, reason: string) {
  return prisma.expense.update({ where: { id }, data: { status: 'rejected', rejectionReason: reason } });
}

export async function getExpensesByCategory(category: string) {
  return prisma.expense.findMany({ where: { category } });
}

export async function reconcileExpenses(budgetId: string) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  const totalExpenses = await prisma.expense.aggregate({
    where: { budgetId, status: 'approved' },
    _sum: { amount: true },
  });

  return {
    allocated: (budget?.amount as number) || 0,
    spent: totalExpenses._sum.amount || 0,
    remaining: ((budget?.amount as number) || 0) - (totalExpenses._sum.amount || 0),
  };
}

export async function exportExpenses(budgetId: string) {
  const expenses = await prisma.expense.findMany({ where: { budgetId } });
  return expenses;
}
