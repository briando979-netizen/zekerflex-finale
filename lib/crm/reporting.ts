import { prisma } from "@/lib/prisma";

export async function getSalesForecast(tenantId: string, months: number = 3) {
  const deals = await prisma.crmDeal.findMany({
    where: { tenantId, stage: { in: ["QUALIFIED", "PROPOSAL", "NEGOTIATION"] } },
  });

  const forecast = deals.reduce((sum, deal) => {
    return sum + (deal.valueCents * deal.probability) / 100;
  }, 0);

  return {
    forecastCents: forecast,
    dealCount: deals.length,
    avgDealSize: deals.length > 0 ? Math.round(forecast / deals.length) : 0,
  };
}

export async function getWinLossAnalysis(tenantId: string) {
  const won = await prisma.crmDeal.findMany({
    where: { tenantId, stage: "WON" },
  });
  const lost = await prisma.crmDeal.findMany({
    where: { tenantId, stage: "LOST" },
  });

  const totalWon = won.reduce((sum, d) => sum + d.valueCents, 0);
  const totalLost = lost.reduce((sum, d) => sum + d.valueCents, 0);
  const total = totalWon + totalLost;

  return {
    winRate: total > 0 ? (won.length / (won.length + lost.length)) * 100 : 0,
    winCount: won.length,
    lostCount: lost.length,
    winValueCents: totalWon,
    lostValueCents: totalLost,
    avgWinSize: won.length > 0 ? Math.round(totalWon / won.length) : 0,
  };
}

export async function getRepPerformance(tenantId: string) {
  const deals = await prisma.crmDeal.findMany({
    where: { tenantId },
  });

  const byRep: Record<string, any> = {};

  for (const deal of deals) {
    const activity = await prisma.crmActivity.findFirst({
      where: { dealId: deal.id },
    });

    const rep = activity?.createdBy || "unassigned";
    if (!byRep[rep]) {
      byRep[rep] = {
        dealsCreated: 0,
        totalValueCents: 0,
        won: 0,
        lost: 0,
      };
    }

    byRep[rep].dealsCreated++;
    byRep[rep].totalValueCents += deal.valueCents;
    if (deal.stage === "WON") byRep[rep].won++;
    if (deal.stage === "LOST") byRep[rep].lost++;
  }

  return byRep;
}

export async function getFunnelMetrics(tenantId: string) {
  const stages = [
    "PROSPECT",
    "QUALIFIED",
    "PROPOSAL",
    "NEGOTIATION",
    "WON",
    "LOST",
  ];
  const funnel: Record<string, number> = {};

  for (const stage of stages) {
    const count = await prisma.crmDeal.count({
      where: { tenantId, stage: stage as any },
    });
    funnel[stage] = count;
  }

  const total = stages.reduce((sum, stage) => sum + funnel[stage], 0);

  return {
    funnel,
    conversionRates: {
      prospectToQualified:
        funnel.PROSPECT > 0
          ? ((funnel.QUALIFIED / funnel.PROSPECT) * 100).toFixed(1)
          : "N/A",
      qualifiedToProposal:
        funnel.QUALIFIED > 0
          ? ((funnel.PROPOSAL / funnel.QUALIFIED) * 100).toFixed(1)
          : "N/A",
      proposalToNegotiation:
        funnel.PROPOSAL > 0
          ? ((funnel.NEGOTIATION / funnel.PROPOSAL) * 100).toFixed(1)
          : "N/A",
      negotiationToWon:
        funnel.NEGOTIATION > 0
          ? ((funnel.WON / funnel.NEGOTIATION) * 100).toFixed(1)
          : "N/A",
    },
  };
}

export async function getConversionMetrics(tenantId: string) {
  const total = await prisma.crmDeal.count({ where: { tenantId } });
  const won = await prisma.crmDeal.count({
    where: { tenantId, stage: "WON" },
  });
  const lost = await prisma.crmDeal.count({
    where: { tenantId, stage: "LOST" },
  });

  return {
    totalDeals: total,
    convertedDeals: won,
    conversionRate: total > 0 ? ((won / total) * 100).toFixed(1) : "0",
    lostRate: total > 0 ? ((lost / total) * 100).toFixed(1) : "0",
  };
}
