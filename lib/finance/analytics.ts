import { prisma } from '@/lib/prisma';

export async function getSpendingTrends(months: number = 12) {
  const data = [];
  for (let i = months - 1; i >= 0; i--) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - i);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const spending = await prisma.expense.aggregate({
      where: { createdAt: { gte: startDate, lte: endDate }, status: 'approved' },
      _sum: { amount: true },
    });

    data.push({
      month: startDate.toLocaleString('default', { month: 'short', year: 'numeric' }),
      spent: spending._sum.amount || 0,
    });
  }
  return data;
}

export async function calculateROI(projectId: string) {
  const costs = await prisma.costAllocation.aggregate({
    where: { targetId: projectId },
    _sum: { amount: true },
  });

  const revenue = await prisma.invoice.aggregate({
    where: { projectId },
    _sum: { total: true },
  });

  const roi = ((revenue._sum.total || 0) - (costs._sum.amount || 0)) / (costs._sum.amount || 1);
  return { investment: costs._sum.amount || 0, revenue: revenue._sum.total || 0, roi: roi * 100 };
}

export async function identifyCostOptimization() {
  const topExpenses = await prisma.expense.groupBy({
    by: ['category'],
    _sum: { amount: true },
    orderBy: { _sum: { amount: 'desc' } },
    take: 5,
  });

  const recommendations = topExpenses.map(e => ({
    category: e.category,
    totalSpend: e._sum.amount,
    recommendation: `Review ${e.category} spending for optimization opportunities`,
    potentialSavings: ((e._sum.amount || 0) * 0.1),
  }));

  return recommendations;
}

export async function predictFutureBudgets(months: number = 3) {
  const historical = await prisma.expense.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } },
  });

  const avgMonthly = (historical.reduce((sum, e) => sum + ((e.amount as number) || 0), 0)) / 6;

  return {
    currentTrend: avgMonthly,
    predictedBudget: avgMonthly * months,
    confidence: 0.8,
    recommendation: avgMonthly > 50000 ? 'Consider budget increase' : 'Current budget adequate',
  };
}

export async function getBudgetHealth() {
  const budgets = await prisma.budget.findMany();

  const health = await Promise.all(
    budgets.map(async b => {
      const spent = await prisma.expense.aggregate({
        where: { budgetId: b.id, status: 'approved' },
        _sum: { amount: true },
      });

      const percentage = ((spent._sum.amount || 0) / ((b.amount as number) || 1)) * 100;

      return {
        budgetId: b.id,
        name: b.name,
        allocated: b.amount,
        spent: spent._sum.amount || 0,
        remaining: ((b.amount as number) || 0) - (spent._sum.amount || 0),
        utilizationPercent: percentage,
        health: percentage > 90 ? 'critical' : percentage > 75 ? 'warning' : 'healthy',
      };
    })
  );

  return health;
}
