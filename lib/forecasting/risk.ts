export function predictChurn(customerMetrics: { monthsActive: number; transactionCount: number; avgSpend: number }[]) {
  return customerMetrics.map((m) => {
    const decayFactor = Math.exp(-m.monthsActive / 24);
    const transactionScore = Math.min(m.transactionCount / 50, 1);
    const spendScore = Math.min(m.avgSpend / 1000, 1);
    const churnRisk = decayFactor * (1 - transactionScore * 0.6 - spendScore * 0.4);
    return Math.round(churnRisk * 100);
  });
}

export function predictFailure(systemMetrics: { errorRate: number; uptime: number; responseTime: number }[]) {
  return systemMetrics.map((m) => {
    const errorScore = m.errorRate * 0.5;
    const uptimeScore = (1 - m.uptime) * 0.3;
    const latencyScore = Math.min(m.responseTime / 2000, 1) * 0.2;
    const failureRisk = errorScore + uptimeScore + latencyScore;
    return Math.round(Math.min(failureRisk * 100, 100));
  });
}

export function opportunityRisk(marketMetrics: { marketGrowth: number; competitorCount: number; marketShare: number }) {
  const growthOpportunity = marketMetrics.marketGrowth * 100;
  const competitionRisk = (marketMetrics.competitorCount / 100) * 50;
  const marketShareGap = (1 - marketMetrics.marketShare) * 30;
  return { growthOpportunity, competitionRisk, marketShareGap };
}
