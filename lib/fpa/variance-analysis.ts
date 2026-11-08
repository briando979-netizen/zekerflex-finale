import { prisma } from "@/lib/prisma";

export async function analyzeVariance(budgetId: string) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  const actuals = await prisma.actualExpense.findMany({ where: { budgetId } });
  const allocations = await prisma.budgetAllocation.findMany({ where: { budgetId } });

  if (!budget) throw new Error("Budget not found");

  const variances = allocations.map(allocation => {
    const actual = actuals
      .filter(a => a.department === allocation.department)
      .reduce((sum, a) => sum + a.amount, 0);

    const variance = allocation.budget - actual;
    const variancePercent = (variance / allocation.budget) * 100;

    return {
      department: allocation.department,
      budgeted: allocation.budget,
      actual,
      variance,
      variancePercent,
      status: Math.abs(variancePercent) > 10 ? "ALERT" : "OK",
    };
  });

  return {
    period: budget.period,
    variances,
    summary: {
      totalBudget: allocations.reduce((sum, a) => sum + a.budget, 0),
      totalActual: actuals.reduce((sum, a) => sum + a.amount, 0),
      totalVariance: allocations.reduce((sum, a) => sum + a.budget, 0) - actuals.reduce((sum, a) => sum + a.amount, 0),
    },
  };
}

export async function rootCauseAnalysis(departmentId: string, period: string) {
  const expenses = await prisma.actualExpense.findMany({
    where: { department: departmentId, period },
  });

  const categories: Record<string, number> = {};

  expenses.forEach(exp => {
    categories[exp.category] = (categories[exp.category] || 0) + exp.amount;
  });

  const sorted = Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return {
    department: departmentId,
    period,
    topExpenses: sorted.map(([category, amount]) => ({
      category,
      amount,
      percentage: (amount / expenses.reduce((sum, e) => sum + e.amount, 0)) * 100,
    })),
  };
}

export async function trendAnalysis(entityId: string, months: number = 12) {
  const actuals = await prisma.actualExpense.findMany({
    where: { entityId },
    orderBy: { period: "desc" },
    take: months,
  });

  const byPeriod: Record<string, number> = {};

  actuals.forEach(a => {
    byPeriod[a.period] = (byPeriod[a.period] || 0) + a.amount;
  });

  const periods = Object.entries(byPeriod)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, amount]) => ({ period, amount }));

  const trend = periods.length > 1
    ? ((periods[periods.length - 1].amount - periods[0].amount) / periods[0].amount) * 100
    : 0;

  return {
    entityId,
    periods,
    trend,
    direction: trend > 0 ? "UP" : trend < 0 ? "DOWN" : "FLAT",
  };
}
