import { prisma } from "@/lib/prisma";
import { RiskLevel, ComplianceStatus } from "@prisma/client";
import type { RiskMetrics } from "./types";

export async function assessRisk(
  tenantId: string,
  riskName: string,
  category: string,
  likelihood: RiskLevel,
  impact: RiskLevel,
  description: string | null
): Promise<string> {
  const riskScore = calculateRiskScore(likelihood, impact);
  const risk = await prisma.riskAssessment.create({
    data: {
      tenantId,
      riskName,
      category,
      likelihood,
      impact,
      riskScore,
      description,
      status: ComplianceStatus.IN_PROGRESS
    }
  });
  return risk.id;
}

export async function mitigateRisk(
  riskId: string,
  mitigationName: string,
  description: string | null,
  owner: string | null,
  dueDate: Date | null
): Promise<string> {
  const mitigation = await prisma.riskMitigation.create({
    data: {
      riskId,
      mitigationName,
      description,
      owner,
      dueDate,
      status: "PLANNED"
    }
  });
  return mitigation.id;
}

export async function monitorRisk(
  riskId: string,
  status: RiskLevel,
  evidence: string | null,
  notes: string | null
): Promise<void> {
  await prisma.riskMonitoring.create({
    data: {
      riskId,
      monitoringDate: new Date(),
      status,
      evidence,
      notes
    }
  });
}

export async function getRiskDashboard(tenantId: string): Promise<RiskMetrics> {
  const risks = await prisma.riskAssessment.findMany({
    where: { tenantId },
    include: { mitigations: true, monitoring: true }
  });

  const totalRisks = risks.length;
  const criticalRisks = risks.filter(r => r.likelihood === RiskLevel.CRITICAL || r.impact === RiskLevel.CRITICAL).length;
  const highRisks = risks.filter(r => r.likelihood === RiskLevel.HIGH || r.impact === RiskLevel.HIGH).length;
  const averageRiskScore = totalRisks > 0 ? Math.round(risks.reduce((sum, r) => sum + r.riskScore, 0) / totalRisks) : 0;
  const mitigatedCount = risks.filter(r => r.mitigations.some(m => m.status === "COMPLETED")).length;
  const monitoringActive = risks.filter(r => r.monitoring.length > 0).length;

  return {
    totalRisks,
    criticalRisks,
    highRisks,
    averageRiskScore,
    mitigatedCount,
    monitoringActive
  };
}

function calculateRiskScore(likelihood: RiskLevel, impact: RiskLevel): number {
  const scoreMap: Record<RiskLevel, number> = {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4
  };
  return scoreMap[likelihood] * scoreMap[impact];
}
