import { prisma } from "@/lib/prisma";
import { RiskLevel } from "@prisma/client";
import type { AuditResult } from "./types";

export async function scheduleAudit(
  tenantId: string,
  auditType: string,
  frequency: string,
  scope: string | null
): Promise<string> {
  const schedule = await prisma.auditSchedule.create({
    data: {
      tenantId,
      auditType,
      frequency: frequency as any,
      nextDueDate: new Date(),
      scope
    }
  });
  return schedule.id;
}

export async function executeAudit(
  scheduleId: string,
  scope: string | null,
  narrative: string | null
): Promise<string> {
  const execution = await prisma.auditExecution.create({
    data: {
      scheduleId,
      executionDate: new Date(),
      scope,
      auditNarrative: narrative,
      status: "IN_PROGRESS"
    }
  });
  return execution.id;
}

export async function getAuditFindings(auditId: string): Promise<AuditResult | null> {
  const audit = await prisma.auditExecution.findUnique({
    where: { id: auditId },
    include: { findings: true }
  });

  if (!audit) return null;

  const critical = audit.findings.filter(f => f.severity === RiskLevel.CRITICAL).length;

  return {
    auditId: audit.id,
    scheduleId: audit.scheduleId,
    executionDate: audit.executionDate,
    completedDate: audit.completedDate,
    findingsCount: audit.findings.length,
    criticalCount: critical,
    status: audit.status,
    overallRating: audit.overallRating
  };
}

export async function reportAudit(
  auditId: string,
  findings: Array<{
    category: string;
    description: string;
    severity: RiskLevel;
    rootCause: string | null;
    recommendedAction: string | null;
  }>,
  overallRating: string
): Promise<void> {
  await prisma.auditExecution.update({
    where: { id: auditId },
    data: {
      status: "COMPLETED",
      completedDate: new Date(),
      overallRating,
      findings: {
        create: findings.map(f => ({
          category: f.category,
          description: f.description,
          severity: f.severity,
          rootCause: f.rootCause,
          recommendedAction: f.recommendedAction,
          status: "OPEN"
        }))
      }
    }
  });
}
