import { prisma } from "@/lib/prisma";

export interface DisputeAnalysis {
  userId: string;
  disputeCount: number;
  winRate: number;
  fraudIndicators: string[];
  isFraudulent: boolean;
}

export async function trackDispute(
  claimantId: string,
  respondentId: string,
  shiftId: string,
  reason: string
): Promise<void> {
  const dispute = await prisma.fraudDispute.create({
    data: {
      claimantId,
      respondentId,
      shiftId,
      reason,
      status: "OPEN",
    },
  });

  // Analyze both parties
  await analyzeDisputeHistory(claimantId);
  await analyzeDisputeHistory(respondentId);
}

export async function analyzeDisputeHistory(userId: string): Promise<DisputeAnalysis> {
  const disputes = await prisma.fraudDispute.findMany({
    where: {
      OR: [{ claimantId: userId }, { respondentId: userId }],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const asClaimant = disputes.filter((d) => d.claimantId === userId);
  const asRespondent = disputes.filter((d) => d.respondentId === userId);

  const resolvedAsClaimant = asClaimant.filter((d) => d.status === "RESOLVED_WON").length;
  const winRate = asClaimant.length > 0 ? (resolvedAsClaimant / asClaimant.length) * 100 : 0;

  const fraudIndicators: string[] = [];
  let isFraudulent = false;

  // High dispute ratio
  if (asClaimant.length > 10) {
    fraudIndicators.push(`Excessive disputes filed: ${asClaimant.length}`);
  }

  // Suspiciously high win rate
  if (winRate > 85 && asClaimant.length >= 5) {
    fraudIndicators.push(`Unusually high dispute win rate: ${Math.round(winRate)}%`);
    isFraudulent = true;
  }

  // Pattern: always suing same respondent
  if (asClaimant.length > 0) {
    const respondentFreq: Record<string, number> = {};
    for (const d of asClaimant) {
      respondentFreq[d.respondentId] = (respondentFreq[d.respondentId] ?? 0) + 1;
    }

    const maxDisputes = Math.max(...Object.values(respondentFreq));
    if (maxDisputes > 3) {
      fraudIndicators.push(`Targeting same respondent multiple times (${maxDisputes} disputes)`);
      isFraudulent = true;
    }
  }

  // Pattern: always losing as respondent
  const resolvedAsRespondent = asRespondent.filter((d) => d.status === "RESOLVED_LOST").length;
  if (asRespondent.length >= 5 && resolvedAsRespondent === asRespondent.length) {
    fraudIndicators.push("Pattern of dispute losses");
  }

  const analysis: DisputeAnalysis = {
    userId,
    disputeCount: disputes.length,
    winRate: Math.round(winRate * 10) / 10,
    fraudIndicators,
    isFraudulent,
  };

  await prisma.fraudDisputeAnalysis.upsert({
    where: { userId },
    create: analysis,
    update: analysis,
  });

  return analysis;
}

export async function resolveDispute(
  disputeId: string,
  outcome: "CLAIMANT_WON" | "RESPONDENT_WON",
): Promise<void> {
  const dispute = await prisma.fraudDispute.update({
    where: { id: disputeId },
    data: {
      status: outcome === "CLAIMANT_WON" ? "RESOLVED_WON" : "RESOLVED_LOST",
      resolvedAt: new Date(),
    },
  });

  // Re-analyze both parties
  await analyzeDisputeHistory(dispute.claimantId);
  await analyzeDisputeHistory(dispute.respondentId);
}

export async function flagSerialDisputers(): Promise<string[]> {
  const flaggedUsers: string[] = [];

  const analyses = await prisma.fraudDisputeAnalysis.findMany({
    where: { isFraudulent: true },
  });

  for (const analysis of analyses) {
    await prisma.fraudRiskProfile.update({
      where: { userId: analysis.userId },
      data: {
        level: "HIGH",
        factors: { push: "Serial disputer pattern detected" },
      },
    });

    flaggedUsers.push(analysis.userId);
  }

  return flaggedUsers;
}
