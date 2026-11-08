import { prisma } from "@/lib/prisma";

export async function generateFinancialReport(entityId: string, period: string) {
  const forecast = await prisma.financialForecast.findFirst({
    where: { entityId, period },
  });

  const budget = await prisma.budget.findFirst({
    where: { entityId, period },
  });

  const variance = budget ? {
    revenueBudget: budget.revenueTarget,
    revenueForecast: forecast?.revenue || 0,
    revenueVariance: (forecast?.revenue || 0) - budget.revenueTarget,
    expenseBudget: budget.expenseTarget,
    expenseForecast: forecast?.expense || 0,
    expenseVariance: (forecast?.expense || 0) - budget.expenseTarget,
  } : null;

  return {
    entityId,
    period,
    forecast: {
      revenue: forecast?.revenue || 0,
      expense: forecast?.expense || 0,
      cashFlow: forecast?.cashFlow || 0,
      margin: forecast?.margin || 0,
    },
    variance,
    insights: generateInsights(forecast, budget),
  };
}

function generateInsights(forecast: any, budget: any) {
  const insights = [];

  if (forecast && budget) {
    if (forecast.revenue < budget.revenueTarget * 0.95) {
      insights.push({
        type: "WARNING",
        message: "Revenue forecast is more than 5% below budget target",
        action: "Review sales pipeline and market conditions",
      });
    }

    if (forecast.expense > budget.expenseTarget * 1.05) {
      insights.push({
        type: "WARNING",
        message: "Expense forecast is more than 5% above budget target",
        action: "Review cost drivers and optimization opportunities",
      });
    }

    if (forecast.margin < 10) {
      insights.push({
        type: "ALERT",
        message: "Profit margin below 10% threshold",
        action: "Implement cost reduction initiatives",
      });
    }
  }

  return insights;
}

export async function generateDashboard(entityId: string) {
  const lastQuarter = Array.from({ length: 3 }, (_, i) => {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    return date.toISOString().slice(0, 7);
  }).reverse();

  const data = await Promise.all(
    lastQuarter.map(period =>
      prisma.financialForecast.findFirst({
        where: { entityId, period },
      })
    )
  );

  return {
    entityId,
    periods: lastQuarter,
    revenue: data.map(d => d?.revenue || 0),
    expense: data.map(d => d?.expense || 0),
    margin: data.map(d => d?.margin || 0),
    trend: data[2] && data[0] ? ((data[2].revenue - data[0].revenue) / data[0].revenue) * 100 : 0,
  };
}

export async function exportReport(reportData: any, format: "pdf" | "excel" | "json") {
  // Simplified - in production integrate with reporting library
  if (format === "json") {
    return JSON.stringify(reportData, null, 2);
  }

  return `Report export in ${format} format: ${JSON.stringify(reportData)}`;
}
