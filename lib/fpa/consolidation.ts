import { prisma } from "@/lib/prisma";

export async function consolidateMultiEntity(parentEntityId: string, period: string) {
  const childEntities = await prisma.entity.findMany({
    where: { parentId: parentEntityId },
  });

  let consolidatedRevenue = 0;
  let consolidatedExpense = 0;
  let intercompanyTransactions = 0;

  for (const entity of childEntities) {
    const forecast = await prisma.financialForecast.findFirst({
      where: { entityId: entity.id, period },
    });

    if (forecast) {
      consolidatedRevenue += forecast.revenue;
      consolidatedExpense += forecast.expense;
    }
  }

  // Apply currency conversion if multi-currency
  const consolidated = await prisma.consolidation.create({
    data: {
      parentEntityId,
      period,
      revenue: consolidatedRevenue,
      expense: consolidatedExpense,
      intercompanyEliminations: intercompanyTransactions,
      margin: consolidatedRevenue > 0 ? ((consolidatedRevenue - consolidatedExpense - intercompanyTransactions) / consolidatedRevenue) * 100 : 0,
    },
  });

  return consolidated;
}

export async function currencyConversion(amount: number, fromCurrency: string, toCurrency: string) {
  // Simplified - in production use external FX service
  const rates: Record<string, number> = {
    USD: 1.0,
    EUR: 0.92,
    GBP: 0.79,
    JPY: 149.5,
  };

  const fromRate = rates[fromCurrency] || 1.0;
  const toRate = rates[toCurrency] || 1.0;

  return (amount / fromRate) * toRate;
}

export async function eliminateIntercompany(parentEntityId: string, period: string) {
  const transactions = await prisma.intercompanyTransaction.findMany({
    where: { parentEntityId, period },
  });

  let eliminations = 0;

  transactions.forEach(txn => {
    eliminations += txn.amount;
  });

  await prisma.consolidation.update({
    where: {
      parentEntityId_period: { parentEntityId, period },
    },
    data: {
      intercompanyEliminations: eliminations,
    },
  });

  return eliminations;
}
