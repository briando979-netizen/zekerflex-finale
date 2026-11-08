export async function analyzeRevenuetrends(data: { month: string; revenue: number }[]) {
  const trend = data.reduce((sum, d) => sum + d.revenue, 0) / data.length;
  const growth = data.length > 1 ? ((data[data.length - 1].revenue - data[0].revenue) / data[0].revenue) * 100 : 0;
  
  return { averageRevenue: trend, growthRate: growth, direction: growth > 0 ? "up" : "down" };
}

export async function benchmarkAgainstCompetitors(ourRevenue: number, competitors: number[]) {
  const avgCompetitor = competitors.reduce((a, b) => a + b, 0) / competitors.length;
  return {
    ourRevenue,
    competitorAverage: avgCompetitor,
    position: ourRevenue > avgCompetitor ? "above" : "below",
    gap: Math.abs(ourRevenue - avgCompetitor),
    percentageLeadLag: ((ourRevenue - avgCompetitor) / avgCompetitor) * 100
  };
}

export async function generateRevenueRecommendations(metrics: Record<string, number>) {
  const recommendations = [];
  
  if (metrics.margin < 0.3) recommendations.push("Increase pricing to improve margins");
  if (metrics.growth < 0.05) recommendations.push("Boost sales and marketing efforts");
  if (metrics.marketShare < 15) recommendations.push("Increase market penetration");
  if (metrics.churn > 0.1) recommendations.push("Improve customer retention");
  
  return recommendations;
}
