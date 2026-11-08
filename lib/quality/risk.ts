import { z } from "zod";
import type { RiskLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// Schemas
export const RiskAssessmentSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().min(10),
  category: z.string(),
  probability: z.number().int().min(1).max(5), // 1=unlikely, 5=almost certain
  impact: z.number().int().min(1).max(5), // 1=minimal, 5=catastrophic
  owner: z.string().optional(),
  mitigation: z.string().optional(),
  contingency: z.string().optional(),
  status: z.enum(["OPEN", "MITIGATING", "MITIGATED", "ACCEPTED", "CLOSED"]).default("OPEN"),
});

export const RiskMitigationSchema = z.object({
  riskId: z.string().cuid(),
  mitigation: z.string().min(10),
  targetDate: z.date(),
  owner: z.string().optional(),
  evidence: z.array(z.string()).optional(),
});

export type RiskAssessmentInput = z.infer<typeof RiskAssessmentSchema>;
export type RiskMitigationInput = z.infer<typeof RiskMitigationSchema>;

// Risk level mapping
const RISK_MATRIX: Record<number, RiskLevel> = {
  1: "MINIMAL",
  2: "MINIMAL",
  3: "MINIMAL",
  4: "LOW",
  5: "LOW",
  6: "LOW",
  8: "LOW",
  9: "MEDIUM",
  10: "MEDIUM",
  12: "MEDIUM",
  15: "MEDIUM",
  16: "HIGH",
  20: "HIGH",
  24: "CRITICAL",
  25: "CRITICAL",
};

/**
 * Calculate risk score and level
 */
function calculateRiskLevel(probability: number, impact: number): { score: number; level: RiskLevel } {
  const score = probability * impact;
  const level = RISK_MATRIX[score] || "MEDIUM";
  return { score, level };
}

/**
 * Create a risk assessment
 */
export async function createRiskAssessment(input: RiskAssessmentInput): Promise<{
  id: string;
  title: string;
  riskLevel: RiskLevel;
  riskScore: number;
}> {
  try {
    const validated = RiskAssessmentSchema.parse(input);
    const { score, level } = calculateRiskLevel(validated.probability, validated.impact);

    const risk = await prisma.riskAssessmentDetail.create({
      data: {
        title: validated.title,
        description: validated.description,
        category: validated.category,
        probability: validated.probability,
        impact: validated.impact,
        riskScore: score,
        riskLevel: level,
        owner: validated.owner,
        mitigation: validated.mitigation,
        contingency: validated.contingency,
        status: validated.status,
      },
      select: { id: true, title: true, riskLevel: true, riskScore: true },
    });

    logger.info("Risk assessment created", {
      riskId: risk.id,
      riskLevel: level,
      riskScore: score,
    });

    return risk;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid risk assessment input", { details: err.errors });
    }
    throw err;
  }
}

/**
 * Get risk matrix overview
 */
export async function getRiskMatrix() {
  try {
    const risks = await prisma.riskAssessmentDetail.findMany({
      select: {
        probability: true,
        impact: true,
        riskScore: true,
        riskLevel: true,
        status: true,
      },
    });

    // Build matrix: rows=probability, cols=impact
    const matrix: Record<number, Record<number, { count: number; levels: string[] }>> = {};

    for (let p = 1; p <= 5; p++) {
      matrix[p] = {};
      for (let i = 1; i <= 5; i++) {
        matrix[p][i] = { count: 0, levels: [] };
      }
    }

    for (const risk of risks) {
      const cell = matrix[risk.probability][risk.impact];
      cell.count++;
      if (!cell.levels.includes(risk.riskLevel)) {
        cell.levels.push(risk.riskLevel);
      }
    }

    return { matrix, totalRisks: risks.length };
  } catch (err) {
    logger.error("Failed to get risk matrix", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve risk matrix");
  }
}

/**
 * Get critical and high risks requiring attention
 */
export async function getCriticalRisks(status?: string[]) {
  try {
    const criticalRisks = await prisma.riskAssessmentDetail.findMany({
      where: {
        riskLevel: { in: ["CRITICAL", "HIGH"] },
        status: status ? { in: status } : undefined,
      },
      orderBy: { riskScore: "desc" },
      select: {
        id: true,
        title: true,
        category: true,
        riskLevel: true,
        riskScore: true,
        probability: true,
        impact: true,
        owner: true,
        mitigation: true,
        status: true,
      },
    });

    const summary = {
      critical: criticalRisks.filter((r) => r.riskLevel === "CRITICAL").length,
      high: criticalRisks.filter((r) => r.riskLevel === "HIGH").length,
      total: criticalRisks.length,
    };

    return { summary, risks: criticalRisks };
  } catch (err) {
    logger.error("Failed to get critical risks", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve critical risks");
  }
}

/**
 * Record mitigation action for a risk
 */
export async function recordMitigation(
  riskId: string,
  mitigation: string,
  targetDate: Date,
  owner?: string
): Promise<{
  id: string;
  status: string;
  targetDate: Date;
}> {
  try {
    if (!mitigation || mitigation.length < 10) {
      throw new AppError("validation", "Mitigation must be at least 10 characters");
    }

    const risk = await prisma.riskAssessmentDetail.findUnique({
      where: { id: riskId },
    });

    if (!risk) {
      throw new AppError("not_found", "Risk assessment not found");
    }

    // Update risk with mitigation details
    const updated = await prisma.riskAssessmentDetail.update({
      where: { id: riskId },
      data: {
        mitigation,
        owner,
        status: "MITIGATING",
      },
      select: { id: true, status: true },
    });

    logger.info("Risk mitigation recorded", {
      riskId,
      targetDate: targetDate.toISOString(),
    });

    return {
      id: updated.id,
      status: updated.status,
      targetDate,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("internal", "Failed to record mitigation");
  }
}

/**
 * Update risk status
 */
export async function updateRiskStatus(
  riskId: string,
  status: "OPEN" | "MITIGATING" | "MITIGATED" | "ACCEPTED" | "CLOSED",
  verification?: string
): Promise<{
  id: string;
  status: string;
  updatedAt: Date;
}> {
  try {
    const updated = await prisma.riskAssessmentDetail.update({
      where: { id: riskId },
      data: {
        status,
        rootCauseAnalysis: verification || undefined,
      },
      select: { id: true, status: true, updatedAt: true },
    });

    logger.info("Risk status updated", {
      riskId,
      newStatus: status,
    });

    return updated;
  } catch (err) {
    if ((err as any).code === "P2025") {
      throw new AppError("not_found", "Risk assessment not found");
    }
    throw new AppError("internal", "Failed to update risk status");
  }
}

/**
 * Perform root cause analysis
 */
export async function performRootCauseAnalysis(
  riskId: string,
  rootCause: string,
  evidence?: string[]
): Promise<{
  id: string;
  rootCauseAnalysis: string;
  evidence: string | null;
}> {
  try {
    if (!rootCause || rootCause.length < 10) {
      throw new AppError("validation", "Root cause analysis must be at least 10 characters");
    }

    const updated = await prisma.riskAssessmentDetail.update({
      where: { id: riskId },
      data: {
        rootCauseAnalysis: rootCause,
        evidence: evidence ? JSON.stringify(evidence) : null,
      },
      select: { id: true, rootCauseAnalysis: true, evidence: true },
    });

    logger.info("Root cause analysis recorded", { riskId });
    return updated;
  } catch (err) {
    if ((err as any).code === "P2025") {
      throw new AppError("not_found", "Risk assessment not found");
    }
    throw new AppError("internal", "Failed to record root cause analysis");
  }
}

/**
 * Get risk profile by category
 */
export async function getRiskProfileByCategory() {
  try {
    const risks = await prisma.riskAssessmentDetail.findMany({
      select: {
        category: true,
        riskLevel: true,
        status: true,
      },
    });

    const categoryMap: Record<
      string,
      {
        total: number;
        critical: number;
        high: number;
        average: number;
        openCount: number;
      }
    > = {};

    for (const risk of risks) {
      if (!categoryMap[risk.category]) {
        categoryMap[risk.category] = {
          total: 0,
          critical: 0,
          high: 0,
          average: 0,
          openCount: 0,
        };
      }

      const cat = categoryMap[risk.category];
      cat.total++;

      if (risk.riskLevel === "CRITICAL") cat.critical++;
      if (risk.riskLevel === "HIGH") cat.high++;
      if (risk.riskLevel === "MEDIUM") cat.average++;
      if (risk.status === "OPEN" || risk.status === "MITIGATING") cat.openCount++;
    }

    return categoryMap;
  } catch (err) {
    logger.error("Failed to get risk profile", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve risk profile");
  }
}

/**
 * Get risk trend over time
 */
export async function getRiskTrend(days = 30) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const risks = await prisma.riskAssessmentDetail.findMany({
      where: {
        createdAt: { gte: cutoffDate },
      },
      orderBy: { createdAt: "asc" },
      select: {
        createdAt: true,
        riskLevel: true,
        status: true,
      },
    });

    const dailyStats: Record<
      string,
      {
        newRisks: number;
        mitigated: number;
        critical: number;
      }
    > = {};

    for (const risk of risks) {
      const date = risk.createdAt.toISOString().split("T")[0];

      if (!dailyStats[date]) {
        dailyStats[date] = { newRisks: 0, mitigated: 0, critical: 0 };
      }

      dailyStats[date].newRisks++;
      if (risk.status === "MITIGATED" || risk.status === "CLOSED") {
        dailyStats[date].mitigated++;
      }
      if (risk.riskLevel === "CRITICAL") {
        dailyStats[date].critical++;
      }
    }

    return Object.entries(dailyStats)
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch (err) {
    logger.error("Failed to get risk trend", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve risk trend");
  }
}

/**
 * Export risk register
 */
export async function exportRiskRegister() {
  try {
    const risks = await prisma.riskAssessmentDetail.findMany({
      orderBy: { riskScore: "desc" },
      select: {
        id: true,
        title: true,
        description: true,
        category: true,
        probability: true,
        impact: true,
        riskScore: true,
        riskLevel: true,
        owner: true,
        mitigation: true,
        contingency: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      total: risks.length,
      exported: new Date().toISOString(),
      risks,
    };
  } catch (err) {
    logger.error("Failed to export risk register", { error: (err as Error).message });
    throw new AppError("internal", "Failed to export risk register");
  }
}
