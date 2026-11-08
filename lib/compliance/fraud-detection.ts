import { prisma } from "@/lib/prisma";
import { AuditLogger } from "@/lib/audit";

export interface FraudSignals {
  rapidProfileChanges: number;
  suspiciousActivity: number;
  multipleAccounts: number;
  lowCompletionRate: number;
  reportedDisputes: number;
  locationAnomaly: number;
  paymentAnomalies: number;
}

export interface FraudAssessment {
  freelancerId: string;
  overallScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  signals: FraudSignals;
  flagCount: number;
  recommendations: string[];
}

const FRAUD_WEIGHTS = {
  rapidProfileChanges: 15,
  suspiciousActivity: 20,
  multipleAccounts: 25,
  lowCompletionRate: 15,
  reportedDisputes: 20,
  locationAnomaly: 10,
  paymentAnomalies: 15,
};

const RISK_THRESHOLDS = {
  critical: 80,
  high: 60,
  medium: 40,
  low: 0,
};

/**
 * Bereken fraude-score voor een freelancer
 */
export async function calculateFraudScore(
  freelancerId: string
): Promise<number> {
  const signals = await getFraudSignals(freelancerId);

  const score =
    (signals.rapidProfileChanges * FRAUD_WEIGHTS.rapidProfileChanges +
      signals.suspiciousActivity * FRAUD_WEIGHTS.suspiciousActivity +
      signals.multipleAccounts * FRAUD_WEIGHTS.multipleAccounts +
      signals.lowCompletionRate * FRAUD_WEIGHTS.lowCompletionRate +
      signals.reportedDisputes * FRAUD_WEIGHTS.reportedDisputes +
      signals.locationAnomaly * FRAUD_WEIGHTS.locationAnomaly +
      signals.paymentAnomalies * FRAUD_WEIGHTS.paymentAnomalies) /
    100;

  return Math.min(100, Math.max(0, score));
}

/**
 * Verzamel fraude-signalen voor beoordeling
 */
async function getFraudSignals(freelancerId: string): Promise<FraudSignals> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { id: freelancerId },
  });

  const shifts = await prisma.shift.findMany({
    where: { freelancerId },
  });

  const disputes = await prisma.dispute.findMany({
    where: {
      OR: [{ raisedBy: freelancerId }, { resolvedBy: freelancerId }],
    },
  });

  // Rapid profile changes (wijzigingen in profiel in korte tijd)
  const rapidChanges = profile?.updatedAt
    ? Math.max(
        0,
        1 - (Date.now() - profile.updatedAt.getTime()) / (24 * 60 * 60 * 1000)
      )
    : 0;

  // Low completion rate
  const completionRate =
    shifts.length > 0
      ? shifts.filter((s) => s.status === "COMPLETED").length / shifts.length
      : 1;

  // Payment anomalies would require analyzing transaction patterns
  // For now, a basic check

  return {
    rapidProfileChanges: Math.min(1, rapidChanges * 10),
    suspiciousActivity: 0, // Would integrate with external fraud detection service
    multipleAccounts: 0, // Device fingerprinting check
    lowCompletionRate: completionRate < 0.5 ? 0.8 : 0,
    reportedDisputes: Math.min(1, disputes.length * 0.2),
    locationAnomaly: 0, // Geo-velocity check
    paymentAnomalies: 0, // Transaction pattern analysis
  };
}

/**
 * Voer volledige fraude-beoordeling uit
 */
export async function assessFraudRisk(
  freelancerId: string
): Promise<FraudAssessment> {
  const score = await calculateFraudScore(freelancerId);
  const signals = await getFraudSignals(freelancerId);

  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  if (score >= RISK_THRESHOLDS.critical) {
    riskLevel = "critical";
  } else if (score >= RISK_THRESHOLDS.high) {
    riskLevel = "high";
  } else if (score >= RISK_THRESHOLDS.medium) {
    riskLevel = "medium";
  }

  const recommendations = generateRecommendations(signals, riskLevel);

  const existingScore = await prisma.fraudScore.findFirst({
    where: { freelancerId },
    orderBy: { createdAt: "desc" },
  });

  // Update or create fraud score
  const fraudScore = await prisma.fraudScore.upsert({
    where: { id: existingScore?.id ?? "new" },
    create: {
      freelancerId,
      overallScore: score,
      riskLevel,
      profileRisk: signals.rapidProfileChanges * 100,
      activityRisk:
        (signals.lowCompletionRate + signals.suspiciousActivity) * 50,
      locationRisk: signals.locationAnomaly * 100,
      paymentRisk: signals.paymentAnomalies * 100,
      signals: signals as unknown as Record<string, unknown>,
      status: "monitored",
    },
    update: {
      overallScore: score,
      riskLevel,
      profileRisk: signals.rapidProfileChanges * 100,
      activityRisk:
        (signals.lowCompletionRate + signals.suspiciousActivity) * 50,
      locationRisk: signals.locationAnomaly * 100,
      paymentRisk: signals.paymentAnomalies * 100,
      signals: signals as unknown as Record<string, unknown>,
    },
  });

  await AuditLogger.log({
    userId: "system",
    action: "CREATE",
    resource: "FraudScore",
    resourceId: fraudScore.id,
    status: "SUCCESS",
    metadata: {
      freelancerId,
      score,
      riskLevel,
      signals,
    },
  });

  return {
    freelancerId,
    overallScore: score,
    riskLevel,
    signals,
    flagCount: await getActiveFlagCount(freelancerId),
    recommendations,
  };
}

/**
 * Vlag profiel als verdacht
 */
export async function flagProfile(
  freelancerId: string,
  reason: string,
  reviewedBy: string
) {
  const fraudScore = await prisma.fraudScore.findFirst({
    where: { freelancerId },
    orderBy: { createdAt: "desc" },
  });

  if (!fraudScore) {
    throw new Error("Fraude-score niet gevonden");
  }

  const updated = await prisma.fraudScore.update({
    where: { id: fraudScore.id },
    data: {
      status: "flagged",
      flags: (fraudScore.flags ?? 0) + 1,
      actionTaken: reason,
      reviewedBy,
      reviewedAt: new Date(),
    },
  });

  await AuditLogger.log({
    userId: reviewedBy,
    action: "UPDATE",
    resource: "FraudScore",
    resourceId: fraudScore.id,
    status: "SUCCESS",
    metadata: {
      freelancerId,
      reason,
      status: "flagged",
    },
  });

  return updated;
}

/**
 * Krijg huidge fraude-status
 */
export async function getFraudStatus(freelancerId: string) {
  const score = await prisma.fraudScore.findFirst({
    where: { freelancerId },
    orderBy: { createdAt: "desc" },
  });

  if (!score) {
    return {
      freelancerId,
      fraudScore: 0,
      riskLevel: "low",
      status: "monitored",
      flagCount: 0,
    };
  }

  return {
    freelancerId,
    fraudScore: score.overallScore,
    riskLevel: score.riskLevel,
    status: score.status,
    flagCount: score.flags ?? 0,
    lastReviewed: score.reviewedAt,
  };
}

/**
 * Genereer fraude-beperkingen als nodig
 */
export async function applyFraudRestrictions(
  freelancerId: string,
  riskLevel: string
) {
  const restrictions: Record<string, any> = {};

  switch (riskLevel) {
    case "critical":
      restrictions.canAcceptShifts = false;
      restrictions.maxShiftValue = 0;
      restrictions.requiresApproval = true;
      restrictions.freezePayments = true;
      break;
    case "high":
      restrictions.maxShiftValue = 1000 * 100; // €10.00 in cents
      restrictions.requiresApproval = true;
      break;
    case "medium":
      restrictions.maxShiftValue = 5000 * 100; // €50.00 in cents
      restrictions.requiresVerification = true;
      break;
    case "low":
      restrictions.maxShiftValue = null;
      break;
  }

  return restrictions;
}

/**
 * Controleer anomalieën in betaalgedrag
 */
export async function detectPaymentAnomalies(freelancerId: string) {
  // Bijvoorbeeld: plotseling veel transacties, ongebruikelijke bedragen, etc.
  const recentPayments = await prisma.invoice.findMany({
    where: { recipientId: freelancerId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const anomalies: string[] = [];

  if (recentPayments.length > 0) {
    const amounts = recentPayments.map((p) => p.totalAmountInCents ?? 0);
    const avgAmount =
      amounts.reduce((a, b) => a + b, 0) / (amounts.length || 1);
    const lastAmount = amounts[0];

    // Detect sudden large payments
    if (lastAmount > avgAmount * 3) {
      anomalies.push("Ongebruikelijk hoog bedrag gedetecteerd");
    }

    // Detect burst activity
    const recentDates = recentPayments.map((p) => p.createdAt);
    if (recentDates.length > 10) {
      const timeDifferences = [];
      for (let i = 1; i < recentDates.length; i++) {
        timeDifferences.push(
          (recentDates[i - 1].getTime() - recentDates[i].getTime()) /
            (1000 * 60 * 60)
        ); // In uren
      }
      const avgInterval = timeDifferences.reduce((a, b) => a + b, 0) / timeDifferences.length;
      if (avgInterval < 1) {
        anomalies.push("Ongebruikelijk veel transacties in korte tijd");
      }
    }
  }

  return anomalies;
}

/**
 * Genereer aanbevelingen gebaseerd op signals
 */
function generateRecommendations(
  signals: FraudSignals,
  riskLevel: string
): string[] {
  const recommendations: string[] = [];

  if (signals.multipleAccounts > 0.5) {
    recommendations.push("Verificatie van identiteit aanbevolen");
  }

  if (signals.lowCompletionRate > 0.5) {
    recommendations.push("Volg werkpatron nauwer");
  }

  if (signals.reportedDisputes > 0.5) {
    recommendations.push("Geschillen onderzoeken");
  }

  if (signals.locationAnomaly > 0.5) {
    recommendations.push("Geografische locatie verifiëren");
  }

  if (riskLevel === "high" || riskLevel === "critical") {
    recommendations.push("Handmatige review aanbevolen");
  }

  return recommendations.length > 0
    ? recommendations
    : ["Normale monitoring voortzetten"];
}

/**
 * Haal aantal actieve vlaggen op
 */
async function getActiveFlagCount(freelancerId: string): Promise<number> {
  const score = await prisma.fraudScore.findFirst({
    where: { freelancerId },
    orderBy: { createdAt: "desc" },
  });

  return score?.flags ?? 0;
}

/**
 * Clear fraude-vlag na herstel
 */
export async function clearFraudFlag(
  freelancerId: string,
  clearedBy: string,
  reason: string
) {
  const score = await prisma.fraudScore.findFirst({
    where: { freelancerId },
    orderBy: { createdAt: "desc" },
  });

  if (!score) {
    throw new Error("Fraude-score niet gevonden");
  }

  const updated = await prisma.fraudScore.update({
    where: { id: score.id },
    data: {
      status: "cleared",
      actionTaken: reason,
      reviewedBy: clearedBy,
      reviewedAt: new Date(),
    },
  });

  await AuditLogger.log({
    userId: clearedBy,
    action: "UPDATE",
    resource: "FraudScore",
    resourceId: score.id,
    status: "SUCCESS",
    metadata: {
      action: "flag_cleared",
      reason,
    },
  });

  return updated;
}
