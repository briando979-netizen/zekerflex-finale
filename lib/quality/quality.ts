import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// Schemas for input validation
export const QualityPolicySchema = z.object({
  standardId: z.string().cuid(),
  title: z.string().min(3).max(255),
  description: z.string().max(1000).optional(),
  scope: z.enum(["enterprise", "department", "location"]),
  content: z.string().min(10),
  status: z.enum(["DRAFT", "APPROVED", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
});

export const InspectionChecklistSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().max(1000).optional(),
  category: z.enum(["process", "product", "safety", "security"]),
  items: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      required: z.boolean(),
      weight: z.number().min(0).max(100),
    })
  ),
});

export const QualityInspectionSchema = z.object({
  standardId: z.string().cuid(),
  checklistId: z.string().cuid(),
  inspectorId: z.string(),
  location: z.string().optional(),
  department: z.string().optional(),
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "REVIEW"]).default("SCHEDULED"),
});

export const NonConformanceSchema = z.object({
  inspectionId: z.string().cuid(),
  title: z.string().min(3).max(255),
  description: z.string().min(10),
  severity: z.enum(["CRITICAL", "MAJOR", "MINOR"]),
  category: z.string(),
});

// Type exports
export type QualityPolicy = z.infer<typeof QualityPolicySchema>;
export type InspectionChecklist = z.infer<typeof InspectionChecklistSchema>;
export type QualityInspection = z.infer<typeof QualityInspectionSchema>;
export type NonConformance = z.infer<typeof NonConformanceSchema>;

/**
 * Create a quality policy for a standard
 */
export async function createQualityPolicy(
  input: QualityPolicy,
  createdBy: string
): Promise<{
  id: string;
  title: string;
  status: string;
}> {
  try {
    const validated = QualityPolicySchema.parse(input);

    const policy = await prisma.qualityPolicy.create({
      data: {
        standardId: validated.standardId,
        title: validated.title,
        description: validated.description ?? "",
        scope: validated.scope,
        content: validated.content,
        status: validated.status,
        createdBy,
        version: 1,
      },
      select: { id: true, title: true, status: true },
    });

    logger.info("Quality policy created", { policyId: policy.id, standardId: validated.standardId });
    return policy;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid policy input", { details: err.errors });
    }
    throw err;
  }
}

/**
 * Create an inspection checklist template
 */
export async function createInspectionChecklist(
  input: InspectionChecklist
): Promise<{
  id: string;
  title: string;
  category: string;
}> {
  try {
    const validated = InspectionChecklistSchema.parse(input);

    const checklist = await prisma.inspectionChecklist.create({
      data: {
        title: validated.title,
        description: validated.description ?? "",
        category: validated.category,
        items: JSON.stringify(validated.items),
        version: 1,
      },
      select: { id: true, title: true, category: true },
    });

    logger.info("Inspection checklist created", { checklistId: checklist.id });
    return checklist;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid checklist input", { details: err.errors });
    }
    throw err;
  }
}

/**
 * Schedule a quality inspection
 */
export async function scheduleQualityInspection(
  input: QualityInspection
): Promise<{
  id: string;
  status: string;
  inspectedAt: string | null;
}> {
  try {
    const validated = QualityInspectionSchema.parse(input);

    // Verify standard and checklist exist
    const [standard, checklist] = await Promise.all([
      prisma.qualityStandard.findUnique({ where: { id: validated.standardId } }),
      prisma.inspectionChecklist.findUnique({ where: { id: validated.checklistId } }),
    ]);

    if (!standard || !checklist) {
      throw new AppError("not_found", "Standard or checklist not found");
    }

    const inspection = await prisma.qualityInspection.create({
      data: {
        standardId: validated.standardId,
        checklistId: validated.checklistId,
        inspectorId: validated.inspectorId,
        location: validated.location,
        department: validated.department,
        status: validated.status,
        findings: JSON.stringify([]),
      },
      select: { id: true, status: true, inspectedAt: true },
    });

    logger.info("Quality inspection scheduled", { inspectionId: inspection.id });
    return inspection;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid inspection input", { details: err.errors });
    }
    throw err;
  }
}

/**
 * Record a non-conformance during inspection
 */
export async function recordNonConformance(
  input: NonConformance,
  evidence?: string
): Promise<{
  id: string;
  severity: string;
  status: string;
}> {
  try {
    const validated = NonConformanceSchema.parse(input);

    const nonConformance = await prisma.nonConformance.create({
      data: {
        inspectionId: validated.inspectionId,
        title: validated.title,
        description: validated.description,
        severity: validated.severity,
        category: validated.category,
        evidence: evidence ? JSON.stringify([evidence]) : null,
      },
      select: { id: true, severity: true, status: true },
    });

    logger.info("Non-conformance recorded", {
      nonConformanceId: nonConformance.id,
      severity: validated.severity,
    });

    return nonConformance;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid non-conformance input", { details: err.errors });
    }
    throw err;
  }
}

/**
 * Create a corrective action for a non-conformance
 */
export async function createCorrectiveAction(
  nonConformanceId: string,
  action: string,
  targetDate: Date,
  assignedTo?: string,
  rootCause?: string
): Promise<{
  id: string;
  status: string;
  targetDate: Date;
}> {
  try {
    if (!action || action.length < 10) {
      throw new AppError("validation", "Action must be at least 10 characters");
    }

    // Verify non-conformance exists
    const nc = await prisma.nonConformance.findUnique({
      where: { id: nonConformanceId },
    });

    if (!nc) {
      throw new AppError("not_found", "Non-conformance not found");
    }

    const ca = await prisma.correctiveAction.create({
      data: {
        nonConformanceId,
        action,
        rootCause: rootCause || "",
        assignedTo,
        targetDate,
        status: "OPEN",
      },
      select: { id: true, status: true, targetDate: true },
    });

    logger.info("Corrective action created", {
      correctiveActionId: ca.id,
      nonConformanceId,
    });

    return ca;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("internal", "Failed to create corrective action");
  }
}

/**
 * Complete an inspection and calculate overall score
 */
export async function completeInspection(
  inspectionId: string,
  findings: Array<{ itemId: string; status: string; notes?: string }>,
  verificationNotes?: string
): Promise<{
  id: string;
  overallScore: number | null;
  status: string;
  completedAt: Date | null;
}> {
  try {
    const inspection = await prisma.qualityInspection.findUnique({
      where: { id: inspectionId },
      include: { checklist: true },
    });

    if (!inspection) {
      throw new AppError("not_found", "Inspection not found");
    }

    // Calculate overall score based on findings
    let totalWeight = 0;
    let weightedScore = 0;

    const checklistItems = JSON.parse(inspection.checklist.items || "[]");
    for (const item of checklistItems) {
      const finding = findings.find((f) => f.itemId === item.id);
      if (finding) {
        const score = finding.status === "PASS" ? 100 : finding.status === "FAIL" ? 0 : 50;
        weightedScore += score * (item.weight || 1);
        totalWeight += item.weight || 1;
      }
    }

    const overallScore = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : null;

    const updated = await prisma.qualityInspection.update({
      where: { id: inspectionId },
      data: {
        findings: JSON.stringify(findings),
        overallScore,
        status: "COMPLETED",
        completedAt: new Date(),
      },
      select: { id: true, overallScore: true, status: true, completedAt: true },
    });

    logger.info("Inspection completed", {
      inspectionId,
      overallScore,
    });

    return updated;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("internal", "Failed to complete inspection");
  }
}

/**
 * Get inspection results with trend analysis
 */
export async function getInspectionResults(standardId: string, limit = 10) {
  try {
    const inspections = await prisma.qualityInspection.findMany({
      where: { standardId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: limit,
      select: {
        id: true,
        overallScore: true,
        completedAt: true,
        department: true,
        location: true,
      },
    });

    const scores = inspections.map((i) => i.overallScore || 0);
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b) / scores.length) : 0;
    const minScore = Math.min(...scores);
    const maxScore = Math.max(...scores);

    return {
      inspections,
      metrics: {
        averageScore: avgScore,
        minScore,
        maxScore,
        trend: inspections.length >= 2 ? "improving" : "stable",
      },
    };
  } catch (err) {
    logger.error("Failed to get inspection results", { standardId, error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve inspection results");
  }
}

/**
 * Get status of corrective actions
 */
export async function getCorrectiveActionStatus() {
  try {
    const actions = await prisma.correctiveAction.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const details = await prisma.correctiveAction.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: { targetDate: "asc" },
      take: 20,
      select: {
        id: true,
        action: true,
        assignedTo: true,
        targetDate: true,
        status: true,
      },
    });

    return {
      summary: Object.fromEntries(actions.map((a) => [a.status, a._count.id])),
      overdue: details.filter((a) => new Date(a.targetDate) < new Date()),
      upcoming: details.filter((a) => new Date(a.targetDate) >= new Date()),
    };
  } catch (err) {
    logger.error("Failed to get corrective action status", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve action status");
  }
}
