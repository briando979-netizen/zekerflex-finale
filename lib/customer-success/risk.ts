import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { CSRiskAssessment } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Risk Management Module
//
// Churn prediction, red flag detection, early warning system, and
// intervention automation for at-risk customers.
// ---------------------------------------------------------------------------

export const RiskAssessmentSchema = z.object({
  tenantId: z.string(),
  usageDecline: z.boolean().default(false),
  supportIncidents: z.number().int().min(0).default(0),
  paymentLate: z.boolean().default(false),
  contractNearEnd: z.boolean().default(false),
  executiveChange: z.boolean().default(false),
});

export type RiskAssessmentInput = z.infer<typeof RiskAssessmentSchema>;

const RISK_FACTOR_WEIGHTS = {
  usageDecline: 25,
  supportIncidents: 15,
  paymentLate: 20,
  contractNearEnd: 15,
  executiveChange: 15,
  daysInactive: 10,
};

function calculateRiskScore(assessment: {
  usageDecline?: boolean;
  supportIncidents?: number;
  paymentLate?: boolean;
  contractNearEnd?: boolean;
  executiveChange?: boolean;
  daysInactive?: number;
}): number {
  let score = 0;

  if (assessment.usageDecline) score += RISK_FACTOR_WEIGHTS.usageDecline;
  if (assessment.paymentLate) score += RISK_FACTOR_WEIGHTS.paymentLate;
  if (assessment.contractNearEnd) score += RISK_FACTOR_WEIGHTS.contractNearEnd;
  if (assessment.executiveChange) score += RISK_FACTOR_WEIGHTS.executiveChange;

  // Support incidents (weighted by count)
  const incidentScore = Math.min(
    RISK_FACTOR_WEIGHTS.supportIncidents,
    (assessment.supportIncidents ?? 0) * 5,
  );
  score += incidentScore;

  // Days inactive
  const daysInactive = assessment.daysInactive ?? 0;
  if (daysInactive > 30) score += Math.min(RISK_FACTOR_WEIGHTS.daysInactive, daysInactive / 3);

  return Math.min(100, score);
}

function identifyRiskFactors(assessment: {
  usageDecline?: boolean;
  supportIncidents?: number;
  paymentLate?: boolean;
  contractNearEnd?: boolean;
  executiveChange?: boolean;
  daysInactive?: number;
}): string[] {
  const factors: string[] = [];

  if (assessment.usageDecline) factors.push("usage_decline");
  if ((assessment.supportIncidents ?? 0) > 5) factors.push("high_support_volume");
  if (assessment.paymentLate) factors.push("payment_late");
  if (assessment.contractNearEnd) factors.push("contract_expiring");
  if (assessment.executiveChange) factors.push("executive_change");

  const daysInactive = assessment.daysInactive ?? 0;
  if (daysInactive > 14) factors.push("extended_inactivity");
  if (daysInactive > 30) factors.push("dormant_account");

  return [...new Set(factors)];
}

/**
 * Assess risk level for a tenant.
 */
export async function assessCustomerRisk(
  input: RiskAssessmentInput,
): Promise<CSRiskAssessment> {
  try {
    const validated = RiskAssessmentSchema.parse(input);

    let assessment = await prisma.cSRiskAssessment.findUnique({
      where: { tenantId: validated.tenantId },
    });

    const riskScore = calculateRiskScore(validated);
    const riskFactors = identifyRiskFactors(validated);

    const shouldAlert = riskScore > 60 && !assessment?.alertSentDate;

    const data = {
      riskLevel: riskScore,
      riskFactors,
      usageDecline: validated.usageDecline,
      supportIncidents: validated.supportIncidents,
      paymentLate: validated.paymentLate,
      contractNearEnd: validated.contractNearEnd,
      executiveChange: validated.executiveChange,
      ...(shouldAlert && { alertSentDate: new Date() }),
    };

    if (!assessment) {
      assessment = await prisma.cSRiskAssessment.create({
        data: {
          tenantId: validated.tenantId,
          ...data,
        },
      });
    } else {
      assessment = await prisma.cSRiskAssessment.update({
        where: { tenantId: validated.tenantId },
        data,
      });
    }

    if (shouldAlert) {
      logger.warn("High-risk customer alert", {
        tenantId: validated.tenantId,
        riskLevel: riskScore,
        factors: riskFactors,
      });
    }

    return assessment;
  } catch (err) {
    logger.error("Failed to assess customer risk", {
      error: (err as Error).message,
    });
    throw AppError.validation("Risicobeoordeling mislukt.");
  }
}

/**
 * Get risk assessment for a tenant.
 */
export async function getRiskAssessment(tenantId: string): Promise<CSRiskAssessment | null> {
  return prisma.cSRiskAssessment.findUnique({
    where: { tenantId },
  });
}

/**
 * Get all high-risk customers (score > 70).
 */
export async function getHighRiskCustomers(limit = 50): Promise<CSRiskAssessment[]> {
  return prisma.cSRiskAssessment.findMany({
    where: {
      riskLevel: { gt: 70 },
      interventionDone: false,
    },
    orderBy: { riskLevel: "desc" },
    take: limit,
  });
}

/**
 * Record intervention action on a risk assessment.
 */
export async function recordIntervention(
  tenantId: string,
  interventionType: string,
  notes?: string,
): Promise<CSRiskAssessment> {
  const assessment = await getRiskAssessment(tenantId);
  if (!assessment) throw AppError.notFound("Risicobeoordeling niet gevonden.");

  const updated = await prisma.cSRiskAssessment.update({
    where: { tenantId },
    data: {
      interventionDone: true,
      interventionType,
      interventionDate: new Date(),
      interventionNotes: notes ?? null,
    },
  });

  logger.info("Intervention recorded", {
    tenantId,
    type: interventionType,
  });

  return updated;
}

/**
 * Escalate a risk assessment.
 */
export async function escalateRisk(tenantId: string): Promise<CSRiskAssessment> {
  return prisma.cSRiskAssessment.update({
    where: { tenantId },
    data: { escalatedAt: new Date() },
  });
}

/**
 * Check if customer has immediate red flags requiring action.
 */
export async function checkRedFlags(tenantId: string): Promise<{
  hasCriticalFlags: boolean;
  flags: string[];
  recommendedAction: string;
}> {
  const assessment = await getRiskAssessment(tenantId);
  if (!assessment) {
    return {
      hasCriticalFlags: false,
      flags: [],
      recommendedAction: "monitor",
    };
  }

  const criticalFlags = assessment.riskFactors.filter((f) =>
    ["payment_late", "dormant_account", "executive_change"].includes(f),
  );

  const hasCritical = criticalFlags.length > 0 || assessment.riskLevel > 80;

  let recommendedAction = "monitor";
  if (assessment.riskLevel > 80) {
    recommendedAction = assessment.interventionDone ? "monitor_close" : "urgent_call";
  } else if (assessment.riskLevel > 60) {
    recommendedAction = "schedule_qbr";
  } else if (assessment.riskLevel > 40) {
    recommendedAction = "increase_engagement";
  }

  return {
    hasCriticalFlags: hasCritical,
    flags: assessment.riskFactors,
    recommendedAction,
  };
}

/**
 * Generate risk report for all customers.
 */
export async function generateRiskReport(): Promise<{
  total_assessed: number;
  critical_risk: number;
  high_risk: number;
  medium_risk: number;
  low_risk: number;
  by_factor: Record<string, number>;
}> {
  const assessments = await prisma.cSRiskAssessment.findMany();

  const critical = assessments.filter((a) => a.riskLevel > 80).length;
  const high = assessments.filter((a) => a.riskLevel > 60 && a.riskLevel <= 80).length;
  const medium = assessments.filter((a) => a.riskLevel > 40 && a.riskLevel <= 60).length;
  const low = assessments.filter((a) => a.riskLevel <= 40).length;

  const factorCounts: Record<string, number> = {};
  for (const assessment of assessments) {
    for (const factor of assessment.riskFactors) {
      factorCounts[factor] = (factorCounts[factor] ?? 0) + 1;
    }
  }

  logger.info("Risk report generated", {
    total: assessments.length,
    critical,
    high,
    medium,
  });

  return {
    total_assessed: assessments.length,
    critical_risk: critical,
    high_risk: high,
    medium_risk: medium,
    low_risk: low,
    by_factor: factorCounts,
  };
}

/**
 * Predict churn probability based on current risk factors.
 */
export function predictChurnProbability(assessment: CSRiskAssessment): number {
  // Sigmoid function: converts risk level to churn probability
  const x = (assessment.riskLevel - 50) / 20;
  const probability = 1 / (1 + Math.exp(-x));

  return Math.round(probability * 100) / 100;
}
