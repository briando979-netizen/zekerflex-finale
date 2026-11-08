import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const budgetSchema = z.object({
  name: z.string().min(1),
  amount: z.number().positive(),
  period: z.enum(['monthly', 'quarterly', 'annual']),
  department: z.string(),
  allocations: z.array(z.object({ category: z.string(), amount: z.number() })),
});

export async function createBudget(data: z.infer<typeof budgetSchema>) {
  const validated = budgetSchema.parse(data);
  return prisma.budget.create({ data: { ...validated, allocations: validated.allocations as any } });
}

export async function getBudgets(departmentId: string) {
  return prisma.budget.findMany({ where: { department: departmentId } });
}

export async function updateBudget(id: string, data: Partial<z.infer<typeof budgetSchema>>) {
  return prisma.budget.update({ where: { id }, data });
}

export async function forecastBudget(id: string, months: number) {
  const budget = await prisma.budget.findUnique({ where: { id } });
  if (!budget) return null;

  const historicalSpend = await prisma.expense.aggregate({
    where: { budgetId: id },
    _sum: { amount: true },
  });

  const avgMonthly = (historicalSpend._sum.amount ?? 0) / 3;
  return { currentAmount: budget.amount as number, forecastedSpend: avgMonthly * months };
}

export async function createScenario(budgetId: string, name: string, adjustments: Record<string, number>) {
  return prisma.budgetScenario.create({
    data: { budgetId, name, adjustments },
  });
}
