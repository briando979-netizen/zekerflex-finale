import { prisma } from "@/lib/prisma";
import { z } from "zod";

const budgetSchema = z.object({
  entityId: z.string(),
  period: z.string(),
  revenueTarget: z.number(),
  expenseTarget: z.number(),
  allocations: z.array(z.object({
    department: z.string(),
    budget: z.number(),
  })),
});

export async function createBudget(input: z.infer<typeof budgetSchema>) {
  const validated = budgetSchema.parse(input);

  const budget = await prisma.budget.create({
    data: {
      entityId: validated.entityId,
      period: validated.period,
      revenueTarget: validated.revenueTarget,
      expenseTarget: validated.expenseTarget,
      status: "DRAFT",
    },
  });

  const allocations = await prisma.budgetAllocation.createMany({
    data: validated.allocations.map(a => ({
      budgetId: budget.id,
      department: a.department,
      budget: a.budget,
    })),
  });

  return { budget, allocations };
}

export async function trackBudgetUsage(budgetId: string) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  const allocations = await prisma.budgetAllocation.findMany({ where: { budgetId } });
  const actuals = await prisma.actualExpense.findMany({
    where: { budgetId },
  });

  const usage = allocations.map(a => {
    const actual = actuals
      .filter(ex => ex.department === a.department)
      .reduce((sum, ex) => sum + ex.amount, 0);

    return {
      department: a.department,
      budget: a.budget,
      actual,
      variance: a.budget - actual,
      variancePercent: ((a.budget - actual) / a.budget) * 100,
    };
  });

  return usage;
}
