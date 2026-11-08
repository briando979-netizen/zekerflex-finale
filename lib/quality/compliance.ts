import { z } from "zod";
import type { ComplianceStatus, QualityStandardFramework } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// Schemas
export const ComplianceFrameworkSchema = z.object({
  name: z.string().min(3).max(255),
  description: z.string().max(1000).optional(),
  frameworks: z.string(), // comma-separated: "ISO_9001, SOC2, GDPR"
  owner: z.string().email().optional(),
  tenantId: z.string().optional(),
});

export const ComplianceControlSchema = z.object({
  frameworkId: z.string().cuid(),
  controlId: z.string().min(1).max(50),
  title: z.string().min(3).max(255),
  description: z.string().min(10),
  category: z.string(),
  status: z.enum(["COMPLIANT", "NON_COMPLIANT", "PARTIAL", "IN_REMEDIATION", "WAIVED", "EXEMPT"]),
  owner: z.string().optional(),
});

export const ComplianceAssessmentSchema = z.object({
  frameworkId: z.string().cuid(),
  assessmentDate: z.date(),
  assessor: z.string().optional(),
  findings: z.array(
    z.object({
      controlId: z.string(),
      status: z.enum(["COMPLIANT", "NON_COMPLIANT", "PARTIAL", "IN_REMEDIATION", "WAIVED", "EXEMPT"]),
      findings: z.string().optional(),
      evidence: z.string().optional(),
    })
  ),
});

export type ComplianceFramework = z.infer<typeof ComplianceFrameworkSchema>;
export type ComplianceControl = z.infer<typeof ComplianceControlSchema>;
export type ComplianceAssessmentInput = z.infer<typeof ComplianceAssessmentSchema>;

/**
 * Create a compliance framework
 */
export async function createComplianceFramework(
  input: ComplianceFramework
): Promise<{
  id: string;
  name: string;
  frameworks: string;
}> {
  try {
    const validated = ComplianceFrameworkSchema.parse(input);

    const framework = await prisma.complianceFramework.create({
      data: {
        name: validated.name,
        description: validated.description,
        frameworks: validated.frameworks,
        owner: validated.owner,
        tenantId: validated.tenantId,
      },
      select: { id: true, name: true, frameworks: true },
    });

    logger.info("Compliance framework created", {
      frameworkId: framework.id,
      frameworks: validated.frameworks,
    });

    return framework;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid framework input", { details: err.errors });
    }
    throw err;
  }
}

/**
 * Add a control to a compliance framework
 */
export async function createComplianceControl(
  input: ComplianceControl,
  standardId?: string
): Promise<{
  id: string;
  controlId: string;
  status: string;
}> {
  try {
    const validated = ComplianceControlSchema.parse(input);

    // Check for duplicate controlId within framework
    const existing = await prisma.complianceControl.findFirst({
      where: {
        frameworkId: validated.frameworkId,
        controlId: validated.controlId,
      },
    });

    if (existing) {
      throw new AppError("conflict", "Control ID already exists in this framework");
    }

    const control = await prisma.complianceControl.create({
      data: {
        frameworkId: validated.frameworkId,
        controlId: validated.controlId,
        title: validated.title,
        description: validated.description,
        category: validated.category,
        status: validated.status as ComplianceStatus,
        owner: validated.owner,
        standardId,
      },
      select: { id: true, controlId: true, status: true },
    });

    logger.info("Compliance control created", {
      controlId: control.id,
      controlCode: validated.controlId,
    });

    return control;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid control input", { details: err.errors });
    }
    if (err instanceof AppError) throw err;
    throw new AppError("internal", "Failed to create compliance control");
  }
}

/**
 * Record a compliance assessment
 */
export async function recordComplianceAssessment(
  input: ComplianceAssessmentInput
): Promise<{
  id: string;
  overallStatus: string;
  assessmentDate: Date;
}> {
  try {
    const validated = ComplianceAssessmentSchema.parse(input);

    // Calculate overall status
    const statuses = validated.findings.map((f) => f.status);
    const compliant = statuses.filter((s) => s === "COMPLIANT").length;
    const nonCompliant = statuses.filter((s) => s === "NON_COMPLIANT").length;
    const partial = statuses.filter((s) => s === "PARTIAL").length;

    let overallStatus: ComplianceStatus = "COMPLIANT";
    if (nonCompliant > 0) {
      overallStatus = "NON_COMPLIANT";
    } else if (partial > 0) {
      overallStatus = "PARTIAL";
    }

    const assessment = await prisma.complianceAssessment.create({
      data: {
        frameworkId: validated.frameworkId,
        assessmentDate: validated.assessmentDate,
        assessor: validated.assessor,
        findings: JSON.stringify(validated.findings),
        overallStatus,
      },
      select: { id: true, overallStatus: true, assessmentDate: true },
    });

    // Update control last assessment
    await Promise.all(
      validated.findings.map((finding) =>
        prisma.complianceControl.updateMany({
          where: {
            frameworkId: validated.frameworkId,
            controlId: finding.controlId,
          },
          data: {
            status: finding.status as ComplianceStatus,
            lastAssessmentId: assessment.id,
          },
        })
      )
    );

    logger.info("Compliance assessment recorded", {
      assessmentId: assessment.id,
      overallStatus,
    });

    return assessment;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new AppError("validation", "Invalid assessment input", { details: err.errors });
    }
    throw err;
  }
}

/**
 * Get compliance status dashboard
 */
export async function getComplianceStatus(frameworkId?: string) {
  try {
    const where = frameworkId ? { frameworkId } : {};

    const [controls, assessments] = await Promise.all([
      prisma.complianceControl.findMany({
        where,
        select: { status: true, category: true },
      }),
      prisma.complianceAssessment.findMany({
        where,
        orderBy: { assessmentDate: "desc" },
        take: 5,
        select: { overallStatus: true, assessmentDate: true },
      }),
    ]);

    const statusCounts = {
      compliant: controls.filter((c) => c.status === "COMPLIANT").length,
      nonCompliant: controls.filter((c) => c.status === "NON_COMPLIANT").length,
      partial: controls.filter((c) => c.status === "PARTIAL").length,
      inRemediation: controls.filter((c) => c.status === "IN_REMEDIATION").length,
      waived: controls.filter((c) => c.status === "WAIVED").length,
      exempt: controls.filter((c) => c.status === "EXEMPT").length,
    };

    const compliancePercentage = controls.length > 0
      ? Math.round((statusCounts.compliant / controls.length) * 100)
      : 0;

    return {
      overallCompliance: compliancePercentage,
      controlCounts: statusCounts,
      totalControls: controls.length,
      recentAssessments: assessments,
      categoryBreakdown: Object.fromEntries(
        Array.from(new Set(controls.map((c) => c.category))).map((cat) => [
          cat,
          controls.filter((c) => c.category === cat).length,
        ])
      ),
    };
  } catch (err) {
    logger.error("Failed to get compliance status", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve compliance status");
  }
}

/**
 * Get non-compliant controls requiring remediation
 */
export async function getRemediationRequired(frameworkId?: string) {
  try {
    const controls = await prisma.complianceControl.findMany({
      where: {
        status: { in: ["NON_COMPLIANT", "PARTIAL", "IN_REMEDIATION"] },
        ...(frameworkId ? { frameworkId } : {}),
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        controlId: true,
        title: true,
        status: true,
        description: true,
        owner: true,
        updatedAt: true,
      },
    });

    return {
      total: controls.length,
      byStatus: {
        nonCompliant: controls.filter((c) => c.status === "NON_COMPLIANT").length,
        partial: controls.filter((c) => c.status === "PARTIAL").length,
        inRemediation: controls.filter((c) => c.status === "IN_REMEDIATION").length,
      },
      details: controls,
    };
  } catch (err) {
    logger.error("Failed to get remediation requirements", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve remediation data");
  }
}

/**
 * Update control status
 */
export async function updateControlStatus(
  controlId: string,
  status: ComplianceStatus,
  notes?: string
): Promise<{
  id: string;
  status: ComplianceStatus;
  updatedAt: Date;
}> {
  try {
    const control = await prisma.complianceControl.update({
      where: { id: controlId },
      data: { status },
      select: { id: true, status: true, updatedAt: true },
    });

    logger.info("Control status updated", {
      controlId,
      newStatus: status,
    });

    return control;
  } catch (err) {
    if ((err as any).code === "P2025") {
      throw new AppError("not_found", "Control not found");
    }
    throw new AppError("internal", "Failed to update control status");
  }
}

/**
 * Get compliance trend over time
 */
export async function getComplianceTrend(frameworkId: string, months = 6) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);

    const assessments = await prisma.complianceAssessment.findMany({
      where: {
        frameworkId,
        assessmentDate: { gte: cutoffDate },
      },
      orderBy: { assessmentDate: "asc" },
      select: {
        assessmentDate: true,
        findings: true,
        overallStatus: true,
      },
    });

    const trend = assessments.map((a) => {
      const findings = JSON.parse(a.findings || "[]");
      const compliant = findings.filter((f: any) => f.status === "COMPLIANT").length;
      const total = findings.length;

      return {
        date: a.assessmentDate.toISOString().split("T")[0],
        compliancePercentage: total > 0 ? Math.round((compliant / total) * 100) : 0,
        overallStatus: a.overallStatus,
      };
    });

    return { trend, duration: months };
  } catch (err) {
    logger.error("Failed to get compliance trend", { error: (err as Error).message });
    throw new AppError("internal", "Failed to retrieve compliance trend");
  }
}

/**
 * Generate compliance summary report
 */
export async function generateComplianceSummary(frameworkId: string) {
  try {
    const framework = await prisma.complianceFramework.findUnique({
      where: { id: frameworkId },
    });

    if (!framework) {
      throw new AppError("not_found", "Framework not found");
    }

    const status = await getComplianceStatus(frameworkId);
    const remediation = await getRemediationRequired(frameworkId);
    const trend = await getComplianceTrend(frameworkId, 3);

    return {
      framework: {
        id: framework.id,
        name: framework.name,
        frameworks: framework.frameworks,
      },
      status,
      remediation,
      trend,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("internal", "Failed to generate compliance summary");
  }
}
