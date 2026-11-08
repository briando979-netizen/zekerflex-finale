import { prisma } from '@/lib/prisma';

export async function generatePL(startDate: Date, endDate: Date) {
  const revenue = await prisma.invoice.aggregate({
    where: { createdAt: { gte: startDate, lte: endDate }, status: 'paid' },
    _sum: { total: true },
  });

  const expenses = await prisma.expense.aggregate({
    where: { createdAt: { gte: startDate, lte: endDate }, status: 'approved' },
    _sum: { amount: true },
  });

  const grossProfit = (revenue._sum.total || 0) - (expenses._sum.amount || 0);

  return {
    revenue: revenue._sum.total || 0,
    expenses: expenses._sum.amount || 0,
    grossProfit,
    margin: revenue._sum.total ? (grossProfit / (revenue._sum.total || 1)) * 100 : 0,
  };
}

export async function generateCashFlow(months: number) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);

  const transactions = await prisma.transaction.findMany({
    where: { createdAt: { gte: startDate, lte: endDate } },
    orderBy: { createdAt: 'asc' },
  });

  let runningBalance = 0;
  return transactions.map(t => ({
    date: t.createdAt,
    amount: t.amount as number,
    runningBalance: (runningBalance += (t.amount as number) * (t.type === 'inflow' ? 1 : -1)),
  }));
}

export async function generateVarianceReport(budgetId: string) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  const actual = await prisma.expense.aggregate({
    where: { budgetId, status: 'approved' },
    _sum: { amount: true },
  });

  const budgeted = (budget?.amount as number) || 0;
  const actualSpent = actual._sum.amount || 0;
  const variance = budgeted - actualSpent;

  return {
    budgeted,
    actual: actualSpent,
    variance,
    variancePercent: budgeted ? (variance / budgeted) * 100 : 0,
    status: variance > 0 ? 'under' : 'over',
  };
}

export async function forecastFinancials(months: number) {
  const historicalData = await prisma.transaction.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
  });

  const avgDaily = (historicalData.reduce((sum, t) => sum + ((t.amount as number) || 0), 0)) / 90;

  return {
    projectedRevenue: avgDaily * 30 * months,
    projectedExpenses: (avgDaily * 0.6) * 30 * months,
    confidence: 0.75,
  };
}
