import { z } from "zod";
import type { ComplianceStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import * as quality from "./quality";
import * as compliance from "./compliance";
import * as risk from "./risk";
import * as audit from "./audit";
import * as training from "./training";

// Schemas
export const ComplianceReportSchema = z.object({
  frameworkId: z.string().cuid(),
  period: z.string().regex(/^\d{4}(-\d{2})?$/), // YYYY or YYYY-MM or YYYY-Q1
  reportType: z.enum(["EXECUTIVE", "DETAILED", "TREND", "GAP_ANALYSIS"]),
});

export type ComplianceReportInput = z.infer<typeof ComplianceReportSchema>;

/**
 * Generate comprehensive compliance report
 */
export async function generateComplianceReport(
  input: ComplianceReportInput
): Promise<{
  id: string;
  period: string;
  overallStatus: ComplianceStatus;
  url?: string;
}> {
  try {
    const validated = ComplianceReportSchema.parse(input);

    // Get compliance status
    const complianceStatus = await compliance.getComplianceStatus(validated.frameworkId);
    const remediation = await compliance.getRemediationRequired(validated.frameworkId);

    // Calculate overall status
    const overallStatus: ComplianceStatus =
      complianceStatus.controlCounts.nonCompliant > 0 ? "NON_COMPLIANT" :
      complianceStatus.controlCounts.partial > 0 ? "PARTIAL" : "COMPLIANT";

    const report = await prisma.complianceReport.create({
      data: {
        frameworkId: validated.frameworkId,
        period: validated.period,
        reportType: validated.reportType,
        overallStatus,
        findings: JSON.stringify({
          compliance: complianceStatus,
          remediation: remediation.byStatus,
        }),
        metrics: JSON.stringify({
          compliancePercentage: complianceStatus.overallCompliance,
          controlsCovered: complianceStatus.totalControls,
          nonCompliantControls: remediation.byStatus.nonCompliant,
        }),
        reportDate: new Date(),
      },
      select: { id: true, period: true, overallStatus: true },
    });

    logger.info("Compliance report generated", {
      reportId: report.id,
      period: validated.period,
      overallStatus,
    });

    return report;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid report input", { details: err.errors });
    }
    throw err;
  }
}

/**
 * Get quality metrics dashboard
 */
export async function getQualityMetricsDashboard() {
  try {
    const [inspections, nonConformances, correctiveActions] = await Promise.all([
      prisma.qualityInspection.findMany({
        where: { status: "COMPLETED" },
        select: { overallScore: true, completedAt: true },
        orderBy: { completedAt: "desc" },
        take: 10,
      }),
      prisma.nonConformance.groupBy({
        by: ["severity"],
        _count: { id: true },
      }),
      prisma.correctiveAction.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
    ]);

    const avgInspectionScore = inspections.length > 0
      ? Math.round(
          inspections.reduce((acc, i) => acc + (i.overallScore || 0), 0) / inspections.length
        )
      : 0;

    const nonConformancesByType = Object.fromEntries(
      nonConformances.map((nc) => [nc.severity, nc._count.id])
    );

    const correctiveActionsByStatus = Object.fromEntries(
      correctiveActions.map((ca) => [ca.status, ca._count.id])
    );

    return {
      inspections: {
        averageScore: avgInspectionScore,
        recentCount: inspections.length,
        trend: inspections.length >= 2 ? "stable" : "unknown",
      },
      nonConformances: {
        bySeverity: nonConformancesByType,
        total: Object.values(nonConformancesByType).reduce((a, b) => a + b, 0),
      },
      correctiveActions: {
        byStatus: correctiveActionsByStatus,
        openActions: (correctiveActionsByStatus["OPEN"] || 0) + (correctiveActionsByStatus["IN_PROGRESS"] || 0),
      },
    };
  } catch (err) {
    logger.error("Failed to get quality metrics", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve quality metrics");
  }
}

/**
 * Get integrated compliance dashboard
 */
export async function getComplianceDashboard() {
  try {
    const [frameworks, assessments, controls] = await Promise.all([
      prisma.complianceFramework.findMany({
        select: { id: true, name: true, frameworks: true },
        take: 10,
      }),
      prisma.complianceAssessment.findMany({
        orderBy: { assessmentDate: "desc" },
        select: { frameworkId: true, overallStatus: true, assessmentDate: true },
        take: 10,
      }),
      prisma.complianceControl.aggregate({
        _count: true,
      }),
    ]);

    const frameworkStatus = await Promise.all(
      frameworks.map((f) => compliance.getComplianceStatus(f.id))
    );

    const complianceBreakdown = Object.fromEntries(
      frameworks.map((f, i) => [
        f.name,
        {
          percentage: frameworkStatus[i].overallCompliance,
          total: frameworkStatus[i].totalControls,
        },
      ])
    );

    return {
      frameworks: frameworks.length,
      controls: {
        total: controls._count,
        recent: assessments.length,
      },
      complianceBreakdown,
      lastAssessment: assessments[0]?.assessmentDate,
    };
  } catch (err) {
    logger.error("Failed to get compliance dashboard", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve compliance dashboard");
  }
}

/**
 * Get risk dashboard
 */
export async function getRiskDashboard() {
  try {
    const [riskMatrix, criticalRisks, riskByStatus] = await Promise.all([
      risk.getRiskMatrix(),
      risk.getCriticalRisks(),
      prisma.riskAssessmentDetail.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
    ]);

    const risksByStatus = Object.fromEntries(
      riskByStatus.map((r) => [r.status, r._count.id])
    );

    return {
      matrix: riskMatrix.matrix,
      totalRisks: riskMatrix.totalRisks,
      critical: criticalRisks.summary,
      byStatus: risksByStatus,
      topRisks: criticalRisks.risks.slice(0, 5),
    };
  } catch (err) {
    logger.error("Failed to get risk dashboard", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve risk dashboard");
  }
}

/**
 * Get audit dashboard
 */
export async function getAuditDashboard() {
  try {
    const [stats, schedule] = await Promise.all([
      audit.getAuditStatistics(),
      audit.getAuditSchedule(),
    ]);

    const remediation = await audit.getRemediationStatus();

    return {
      audits: stats.audits,
      findings: stats.findings,
      remediation: remediation.summary,
      upcomingAudits: schedule.upcoming.length,
      completedAudits: schedule.completed.length,
    };
  } catch (err) {
    logger.error("Failed to get audit dashboard", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve audit dashboard");
  }
}

/**
 * Get training dashboard
 */
export async function getTrainingDashboard() {
  try {
    const [report, expiring] = await Promise.all([
      training.getTrainingComplianceReport(),
      training.getExpiringCertifications(30),
    ]);

    return {
      training: report.stats,
      courses: report.courseStats.length,
      completionRate: report.stats.completionRate,
      expiringCertifications: expiring.total,
      topCourses: report.courseStats
        .sort((a, b) => b.enrolled - a.enrolled)
        .slice(0, 5),
    };
  } catch (err) {
    logger.error("Failed to get training dashboard", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve training dashboard");
  }
}

/**
 * Get integrated compliance & quality overview
 */
export async function getQualityAndComplianceOverview() {
  try {
    const [qualityMetrics, complianceDash, riskDash, auditDash, trainingDash] = await Promise.all([
      getQualityMetricsDashboard(),
      getComplianceDashboard(),
      getRiskDashboard(),
      getAuditDashboard(),
      getTrainingDashboard(),
    ]);

    const overallHealthScore = Math.round(
      (complianceDash.frameworks > 0
        ? Object.values(complianceDash.complianceBreakdown).reduce(
            (acc: number, item: any) => acc + item.percentage,
            0
          ) / Object.values(complianceDash.complianceBreakdown).length
        : 50) * 0.4 +
        (100 - (riskDash.critical.critical + riskDash.critical.high) * 10) * 0.3 +
        auditDash.findings.remediationRate * 0.2 +
        trainingDash.completionRate * 0.1
    );

    return {
      overallHealthScore,
      quality: qualityMetrics,
      compliance: complianceDash,
      risk: riskDash,
      audit: auditDash,
      training: trainingDash,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.error("Failed to get overview", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve overview");
  }
}

/**
 * Export compliance metrics for external use
 */
export async function exportComplianceMetrics(format: "json" | "csv" = "json") {
  try {
    const overview = await getQualityAndComplianceOverview();

    if (format === "json") {
      return {
        data: overview,
        format: "json",
        exportedAt: new Date().toISOString(),
      };
    } else {
      // CSV format
      const rows = [
        ["Metric", "Value", "Status"],
        ["Overall Health Score", overview.overallHealthScore, "healthy"],
        ["Quality - Avg Inspection Score", overview.quality.inspections.averageScore, "info"],
        ["Compliance Frameworks", overview.compliance.frameworks, "info"],
        ["Critical Risks", overview.risk.critical.critical, "alert"],
        ["High Risks", overview.risk.critical.high, "warning"],
        ["Audit Findings - Remediated", `${overview.audit.findings.remediationRate}%`, "info"],
        ["Training Completion Rate", `${overview.training.completionRate}%`, "info"],
      ];

      return {
        data: rows,
        format: "csv",
        exportedAt: new Date().toISOString(),
      };
    }
  } catch (err) {
    logger.error("Failed to export metrics", { error: (err as Error).message });
    throw new AppError("internal", "Failed to export metrics");
  }
}

/**
 * Get trending analysis
 */
export async function getTrendingAnalysis() {
  try {
    const [riskTrend, complianceTrend] = await Promise.all([
      risk.getRiskTrend(90),
      compliance.getComplianceTrend("", 3).catch(() => ({ trend: [] })),
    ]);

    // Analyze trends
    const riskTrendAnalysis = {
      direction: riskTrend.length >= 2 ?
        riskTrend[riskTrend.length - 1].newRisks > riskTrend[0].newRisks ? "increasing" : "decreasing"
        : "stable",
      newRisksPerMonth: Math.round(
        riskTrend.reduce((acc, r) => acc + r.newRisks, 0) / Math.max(1, riskTrend.length)
      ),
      mitigationRate: riskTrend.length > 0
        ? Math.round(
            (riskTrend.reduce((acc, r) => acc + r.mitigated, 0) /
            riskTrend.reduce((acc, r) => acc + r.newRisks, 0)) * 100
          )
        : 0,
    };

    return {
      riskTrend: riskTrendAnalysis,
      period: "90days",
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.error("Failed to get trending analysis", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve trending analysis");
  }
}

/**
 * Get compliance gap analysis
 */
export async function getComplianceGapAnalysis(frameworkId: string) {
  try {
    const remediation = await compliance.getRemediationRequired(frameworkId);
    const status = await compliance.getComplianceStatus(frameworkId);

    const gaps = {
      unaddressed: remediation.byStatus.nonCompliant,
      partiallyAddressed: remediation.byStatus.partial,
      inRemediation: remediation.byStatus.inRemediation,
      totalGaps: remediation.total,
      compliancePercentage: status.overallCompliance,
    };

    // Estimate remediation timeline
    const avgRemediationDays = 30; // assumption
    const estimatedCompletionDate = new Date();
    estimatedCompletionDate.setDate(
      estimatedCompletionDate.getDate() + avgRemediationDays * gaps.inRemediation
    );

    return {
      gaps,
      estimatedCompletion: estimatedCompletionDate.toISOString(),
      recommendation: gaps.compliancePercentage >= 90
        ? "Maintain current compliance posture with regular monitoring"
        : gaps.compliancePercentage >= 75
        ? "Priority remediation recommended for critical gaps"
        : "Urgent remediation required - multiple critical gaps",
    };
  } catch (err) {
    logger.error("Failed to get gap analysis", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve gap analysis");
  }
}
