import { prisma } from "@/lib/prisma";

export async function getProposalAnalytics(tenantId: string, startDate: Date, endDate: Date) {
  const proposals = await prisma.proposal.findMany({
    where: {
      tenantId,
      createdAt: { gte: startDate, lte: endDate },
    },
    include: { quote: true },
  });

  const total = proposals.length;
  const signed = proposals.filter(p => p.status === "SIGNED").length;
  const winRate = total > 0 ? (signed / total) * 100 : 0;

  const totalRevenue = proposals
    .filter(p => p.status === "SIGNED")
    .reduce((sum, p) => sum + (p.quote?.total || 0), 0);

  const avgProposalValue = total > 0
    ? proposals.reduce((sum, p) => sum + (p.quote?.total || 0), 0) / total
    : 0;

  const avgDaysToSign = signed > 0
    ? proposals
        .filter(p => p.status === "SIGNED" && p.signedAt)
        .reduce((sum, p) => {
          const days = Math.floor((p.signedAt!.getTime() - p.createdAt.getTime()) / (1000 * 60 * 60 * 24));
          return sum + days;
        }, 0) / signed
    : 0;

  return {
    total,
    signed,
    declined: proposals.filter(p => p.status === "DECLINED").length,
    winRate: parseFloat(winRate.toFixed(2)),
    totalRevenue,
    avgProposalValue: parseFloat(avgProposalValue.toFixed(2)),
    avgDaysToSign: parseFloat(avgDaysToSign.toFixed(1)),
    byStatus: {
      draft: proposals.filter(p => p.status === "DRAFT").length,
      review: proposals.filter(p => p.status === "REVIEW").length,
      approved: proposals.filter(p => p.status === "APPROVED").length,
      sent: proposals.filter(p => p.status === "SENT").length,
      signed: signed,
      declined: proposals.filter(p => p.status === "DECLINED").length,
    },
  };
}

export async function getClientMetrics(tenantId: string, clientId: string) {
  const proposals = await prisma.proposal.findMany({
    where: { tenantId, clientId },
    include: { quote: true },
  });

  const totalProposals = proposals.length;
  const totalSigned = proposals.filter(p => p.status === "SIGNED").length;
  const totalValue = proposals
    .filter(p => p.status === "SIGNED")
    .reduce((sum, p) => sum + (p.quote?.total || 0), 0);

  return {
    clientId,
    totalProposals,
    signedProposals: totalSigned,
    conversionRate: totalProposals > 0 ? (totalSigned / totalProposals) * 100 : 0,
    totalLifetimeValue: totalValue,
    avgProposalValue: totalProposals > 0
      ? proposals.reduce((sum, p) => sum + (p.quote?.total || 0), 0) / totalProposals
      : 0,
  };
}

export async function forecaseRevenue(tenantId: string, monthsAhead: number) {
  const historicalProposals = await prisma.proposal.findMany({
    where: {
      tenantId,
      status: "SIGNED",
      signedAt: {
        gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
      },
    },
    include: { quote: true },
  });

  const avgMonthlyRevenue = historicalProposals.length > 0
    ? historicalProposals.reduce((sum, p) => sum + (p.quote?.total || 0), 0) / 3
    : 0;

  const forecast = [];
  for (let i = 1; i <= monthsAhead; i++) {
    forecast.push({
      month: i,
      forecastedRevenue: parseFloat((avgMonthlyRevenue * 1.05 ** i).toFixed(2)), // 5% growth
    });
  }

  return forecast;
}
