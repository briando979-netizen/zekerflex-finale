import { z } from "zod";
import type { AuditStatus, FindingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// Schemas
export const AuditRecordSchema = z.object({
  type: z.enum(["INTERNAL", "EXTERNAL", "COMPLIANCE", "FOLLOW_UP"]),
  scope: z.string().min(5),
  period: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  auditDate: z.date(),
  lead: z.string().optional(),
  team: z.array(z.string()).optional(),
});

export const AuditFindingSchema = z.object({
  auditId: z.string().cuid(),
  category: z.string(),
  description: z.string().min(10),
  severity: z.enum(["CRITICAL", "MAJOR", "MINOR", "OBSERVATION"]),
  evidence: z.string().optional(),
});

export const RemediationPlanSchema = z.object({
  findingId: z.string().cuid(),
  remediationPlan: z.string().min(10),
  targetDate: z.date(),
});

export type AuditRecordInput = z.infer<typeof AuditRecordSchema>;
export type AuditFindingInput = z.infer<typeof AuditFindingSchema>;
export type RemediationPlanInput = z.infer<typeof RemediationPlanSchema>;

/**
 * Generate unique audit code
 */
function generateAuditCode(type: string): string {
  const prefix = type.substring(0, 3).toUpperCase();
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `AUD-${prefix}-${timestamp}-${random}`;
}

/**
 * Schedule an audit
 */
export async function scheduleAudit(input: AuditRecordInput): Promise<{
  id: string;
  auditCode: string;
  status: AuditStatus;
  auditDate: Date;
}> {
  try {
    const validated = AuditRecordSchema.parse(input);
    const auditCode = generateAuditCode(validated.type);

    const audit = await prisma.auditRecord.create({
      data: {
        auditCode,
        type: validated.type,
        scope: validated.scope,
        period: validated.period,
        auditDate: validated.auditDate,
        lead: validated.lead,
        team: validated.team ? JSON.stringify(validated.team) : null,
        status: "SCHEDULED",
      },
      select: { id: true, auditCode: true, status: true, auditDate: true },
    });

    logger.info("Audit scheduled", {
      auditId: audit.id,
      auditCode,
      type: validated.type,
    });

    return audit;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid audit input", { details: err.errors });
    }
    throw err;
  }
}

/**
 * Record an audit finding
 */
export async function recordAuditFinding(input: AuditFindingInput): Promise<{
  id: string;
  findingNumber: number;
  severity: string;
  status: FindingStatus;
}> {
  try {
    const validated = AuditFindingSchema.parse(input);

    // Get latest finding number for this audit
    const lastFinding = await prisma.auditFinding.findFirst({
      where: { auditId: validated.auditId },
      orderBy: { findingNumber: "desc" },
      select: { findingNumber: true },
    });

    const findingNumber = (lastFinding?.findingNumber ?? 0) + 1;

    const finding = await prisma.auditFinding.create({
      data: {
        auditId: validated.auditId,
        findingNumber,
        category: validated.category,
        description: validated.description,
        evidence: validated.evidence,
        severity: validated.severity,
        status: "OPEN",
      },
      select: { id: true, findingNumber: true, severity: true, status: true },
    });

    logger.info("Audit finding recorded", {
      findingId: finding.id,
      auditId: validated.auditId,
      severity: validated.severity,
    });

    return finding;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid finding input", { details: err.errors });
    }
    throw err;
  }
}

/**
 * Create remediation plan for a finding
 */
export async function createRemediationPlan(
  input: RemediationPlanInput,
  assignedTo?: string
): Promise<{
  id: string;
  status: FindingStatus;
  targetDate: Date;
}> {
  try {
    const validated = RemediationPlanSchema.parse(input);

    const updated = await prisma.auditFinding.update({
      where: { id: validated.findingId },
      data: {
        remediationPlan: validated.remediationPlan,
        targetDate: validated.targetDate,
        status: "REMEDIATION",
      },
      select: { id: true, status: true, targetDate: true },
    });

    logger.info("Remediation plan created", {
      findingId: validated.findingId,
      targetDate: validated.targetDate.toISOString(),
    });

    return updated;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid remediation plan input", { details: err.errors });
    }
    throw err;
  }
}

/**
 * Update audit status
 */
export async function updateAuditStatus(
  auditId: string,
  status: AuditStatus,
  completionDate?: Date
): Promise<{
  id: string;
  status: AuditStatus;
  completionDate: Date | null;
}> {
  try {
    const updated = await prisma.auditRecord.update({
      where: { id: auditId },
      data: {
        status,
        completionDate: status === "COMPLETED" ? completionDate || new Date() : null,
      },
      select: { id: true, status: true, completionDate: true },
    });

    logger.info("Audit status updated", {
      auditId,
      newStatus: status,
    });

    return updated;
  } catch (err) {
    if ((err as any).code === "P2025") {
      throw new AppError("not_found", "Audit not found");
    }
    throw new AppError("internal", "Failed to update audit status");
  }
}

/**
 * Get audit findings
 */
export async function getAuditFindings(
  auditId: string,
  severity?: string[]
): Promise<{
  total: number;
  bySeverity: Record<string, number>;
  findings: Array<{
    id: string;
    findingNumber: number;
    category: string;
    description: string;
    severity: string;
    status: FindingStatus;
    targetDate: Date | null;
  }>;
}> {
  try {
    const findings = await prisma.auditFinding.findMany({
      where: {
        auditId,
        severity: severity ? { in: severity } : undefined,
      },
      orderBy: { findingNumber: "asc" },
      select: {
        id: true,
        findingNumber: true,
        category: true,
        description: true,
        severity: true,
        status: true,
        targetDate: true,
      },
    });

    const bySeverity = {
      CRITICAL: findings.filter((f) => f.severity === "CRITICAL").length,
      MAJOR: findings.filter((f) => f.severity === "MAJOR").length,
      MINOR: findings.filter((f) => f.severity === "MINOR").length,
      OBSERVATION: findings.filter((f) => f.severity === "OBSERVATION").length,
    };

    return {
      total: findings.length,
      bySeverity,
      findings,
    };
  } catch (err) {
    logger.error("Failed to get audit findings", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve audit findings");
  }
}

/**
 * Verify remediation
 */
export async function verifyRemediation(
  findingId: string,
  verifiedBy: string,
  notes?: string
): Promise<{
  id: string;
  status: FindingStatus;
  verifiedAt: Date;
}> {
  try {
    const updated = await prisma.auditFinding.update({
      where: { id: findingId },
      data: {
        status: "VERIFIED_CLOSED",
        verifiedBy,
        verifiedAt: new Date(),
      },
      select: { id: true, status: true, verifiedAt: true },
    });

    logger.info("Remediation verified", { findingId, verifiedBy });
    return updated;
  } catch (err) {
    if ((err as any).code === "P2025") {
      throw new AppError("not_found", "Finding not found");
    }
    throw new AppError("internal", "Failed to verify remediation");
  }
}

/**
 * Get audit schedule
 */
export async function getAuditSchedule(
  period?: string,
  status?: AuditStatus[]
): Promise<{
  upcoming: Array<{
    id: string;
    auditCode: string;
    type: string;
    scope: string;
    auditDate: Date;
    lead: string | null;
    status: AuditStatus;
  }>;
  completed: Array<{
    id: string;
    auditCode: string;
    type: string;
    period: string;
    completionDate: Date | null;
  }>;
}> {
  try {
    const upcoming = await prisma.auditRecord.findMany({
      where: {
        auditDate: { gte: new Date() },
        status: { notIn: ["COMPLETED", "CLOSED"] },
      },
      orderBy: { auditDate: "asc" },
      select: {
        id: true,
        auditCode: true,
        type: true,
        scope: true,
        auditDate: true,
        lead: true,
        status: true,
      },
    });

    const completed = await prisma.auditRecord.findMany({
      where: {
        period,
        status: { in: ["COMPLETED", "CLOSED"] },
      },
      orderBy: { completionDate: "desc" },
      take: 10,
      select: {
        id: true,
        auditCode: true,
        type: true,
        period: true,
        completionDate: true,
      },
    });

    return { upcoming, completed };
  } catch (err) {
    logger.error("Failed to get audit schedule", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve audit schedule");
  }
}

/**
 * Get remediation status
 */
export async function getRemediationStatus() {
  try {
    const findings = await prisma.auditFinding.findMany({
      where: { status: { in: ["OPEN", "REMEDIATION"] } },
      select: {
        id: true,
        findingNumber: true,
        description: true,
        severity: true,
        status: true,
        targetDate: true,
        audit: { select: { auditCode: true } },
      },
      orderBy: [{ status: "asc" }, { targetDate: "asc" }],
    });

    const overdue = findings.filter((f) => f.targetDate && f.targetDate < new Date());
    const onTrack = findings.filter((f) => !f.targetDate || f.targetDate >= new Date());

    const summary = {
      total: findings.length,
      open: findings.filter((f) => f.status === "OPEN").length,
      inProgress: findings.filter((f) => f.status === "REMEDIATION").length,
      overdue: overdue.length,
      onTrack: onTrack.length,
    };

    return { summary, overdue, onTrack };
  } catch (err) {
    logger.error("Failed to get remediation status", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve remediation status");
  }
}

/**
 * Generate audit report
 */
export async function generateAuditReport(auditId: string) {
  try {
    const audit = await prisma.auditRecord.findUnique({
      where: { id: auditId },
    });

    if (!audit) {
      throw new AppError("not_found", "Audit not found");
    }

    const findings = await getAuditFindings(auditId);
    const remediation = await getRemediationStatus();

    return {
      audit: {
        id: audit.id,
        auditCode: audit.auditCode,
        type: audit.type,
        scope: audit.scope,
        period: audit.period,
        auditDate: audit.auditDate,
        completionDate: audit.completionDate,
        lead: audit.lead,
        status: audit.status,
      },
      findings,
      remediation,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("internal", "Failed to generate audit report");
  }
}

/**
 * Get audit statistics
 */
export async function getAuditStatistics() {
  try {
    const [total, completed, inProgress, critical, major] = await Promise.all([
      prisma.auditRecord.count(),
      prisma.auditRecord.count({ where: { status: { in: ["COMPLETED", "CLOSED"] } } }),
      prisma.auditRecord.count({ where: { status: "IN_PROGRESS" } }),
      prisma.auditFinding.count({ where: { severity: "CRITICAL" } }),
      prisma.auditFinding.count({ where: { severity: "MAJOR" } }),
    ]);

    const remediatedFindings = await prisma.auditFinding.count({
      where: { status: "VERIFIED_CLOSED" },
    });

    const totalFindings = await prisma.auditFinding.count();
    const remediationRate = totalFindings > 0 ? Math.round((remediatedFindings / totalFindings) * 100) : 0;

    return {
      audits: {
        total,
        completed,
        inProgress,
      },
      findings: {
        total: totalFindings,
        critical,
        major,
        remediated: remediatedFindings,
        remediationRate,
      },
    };
  } catch (err) {
    logger.error("Failed to get audit statistics", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve audit statistics");
  }
}
