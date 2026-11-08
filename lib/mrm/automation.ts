import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { AppError } from "@/lib/errors";

// ============================================================================
// 5. MARKETING AUTOMATION - Workflow builder, triggers, lead scoring, nurture
// ============================================================================

const CreateWorkflowSchema = z.object({
  name: z.string().min(1, "Workflownaam is verplicht"),
  description: z.string().optional(),
  type: z.enum(["LEAD_NURTURE", "WELCOME_SERIES", "RE_ENGAGEMENT", "DRIP", "TRIGGER_BASED"]),
  triggerType: z.enum(["ON_SIGNUP", "ON_PURCHASE", "ON_ENGAGEMENT", "TIME_DELAY", "MANUAL"]),
  triggerConfig: z.record(z.any()),
  enableLeadScoring: z.boolean().optional(),
  campaignId: z.string().optional(),
});

const CreateWorkflowStepSchema = z.object({
  stepNumber: z.number().int().positive(),
  action: z.string(),
  actionConfig: z.record(z.any()),
  delayMinutes: z.number().int().nonnegative().optional(),
  condition: z.record(z.any()).optional(),
});

export type CreateWorkflowInput = z.infer<typeof CreateWorkflowSchema>;
export type CreateWorkflowStepInput = z.infer<typeof CreateWorkflowStepSchema>;

/**
 * Create a marketing automation workflow
 */
export async function createAutomationWorkflow(
  tenantId: string,
  input: CreateWorkflowInput,
) {
  const validated = CreateWorkflowSchema.parse(input);

  if (validated.campaignId) {
    const campaign = await prisma.mrmCampaign.findUnique({
      where: { id: validated.campaignId },
    });

    if (!campaign) {
      throw AppError.notFound("Campagne niet gevonden");
    }
  }

  return prisma.mrmAutomationWorkflow.create({
    data: {
      tenantId,
      campaignId: validated.campaignId || null,
      name: validated.name,
      description: validated.description,
      type: validated.type,
      triggerType: validated.triggerType,
      triggerConfig: validated.triggerConfig,
      enableLeadScoring: validated.enableLeadScoring || false,
      status: "DRAFT",
    },
  });
}

/**
 * Get workflows for a tenant
 */
export async function getAutomationWorkflows(
  tenantId: string,
  filters?: {
    status?: string;
    type?: string;
    limit?: number;
    offset?: number;
  },
) {
  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  const where: any = { tenantId };
  if (filters?.status) where.status = filters.status;
  if (filters?.type) where.type = filters.type;

  const [workflows, total] = await Promise.all([
    prisma.mrmAutomationWorkflow.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        steps: { orderBy: { stepNumber: "asc" } },
      },
    }),
    prisma.mrmAutomationWorkflow.count({ where }),
  ]);

  return { workflows, total, limit, offset };
}

/**
 * Get a workflow by ID
 */
export async function getAutomationWorkflowById(id: string, tenantId: string) {
  const workflow = await prisma.mrmAutomationWorkflow.findFirst({
    where: { id, tenantId },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
      campaign: {
        select: { id: true, name: true },
      },
    },
  });

  if (!workflow) {
    throw AppError.notFound("Workflow niet gevonden");
  }

  return workflow;
}

/**
 * Add a step to a workflow
 */
export async function addWorkflowStep(
  workflowId: string,
  tenantId: string,
  input: CreateWorkflowStepInput,
) {
  const validated = CreateWorkflowStepSchema.parse(input);

  const workflow = await prisma.mrmAutomationWorkflow.findFirst({
    where: { id: workflowId, tenantId },
  });

  if (!workflow) {
    throw AppError.notFound("Workflow niet gevonden");
  }

  // Check for duplicate step number
  const existingStep = await prisma.mrmWorkflowStep.findFirst({
    where: {
      workflowId,
      stepNumber: validated.stepNumber,
    },
  });

  if (existingStep) {
    throw AppError.conflict(`Stap ${validated.stepNumber} bestaat al`);
  }

  return prisma.mrmWorkflowStep.create({
    data: {
      workflowId,
      stepNumber: validated.stepNumber,
      action: validated.action,
      actionConfig: validated.actionConfig,
      delayMinutes: validated.delayMinutes || 0,
      condition: validated.condition,
    },
  });
}

/**
 * Update a workflow step
 */
export async function updateWorkflowStep(
  stepId: string,
  input: Partial<CreateWorkflowStepInput>,
) {
  const step = await prisma.mrmWorkflowStep.findUnique({
    where: { id: stepId },
  });

  if (!step) {
    throw AppError.notFound("Workflowstap niet gevonden");
  }

  return prisma.mrmWorkflowStep.update({
    where: { id: stepId },
    data: {
      ...(input.action !== undefined && { action: input.action }),
      ...(input.actionConfig !== undefined && { actionConfig: input.actionConfig }),
      ...(input.delayMinutes !== undefined && { delayMinutes: input.delayMinutes }),
      ...(input.condition !== undefined && { condition: input.condition }),
    },
  });
}

/**
 * Delete a workflow step
 */
export async function deleteWorkflowStep(stepId: string) {
  const step = await prisma.mrmWorkflowStep.findUnique({
    where: { id: stepId },
  });

  if (!step) {
    throw AppError.notFound("Workflowstap niet gevonden");
  }

  return prisma.mrmWorkflowStep.delete({
    where: { id: stepId },
  });
}

/**
 * Update workflow status
 */
export async function updateWorkflowStatus(
  id: string,
  tenantId: string,
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED",
) {
  const workflow = await prisma.mrmAutomationWorkflow.findFirst({
    where: { id, tenantId },
  });

  if (!workflow) {
    throw AppError.notFound("Workflow niet gevonden");
  }

  const data: any = { status };
  if (status === "ACTIVE" && !workflow.startedAt) {
    data.startedAt = new Date();
  }

  return prisma.mrmAutomationWorkflow.update({
    where: { id },
    data,
  });
}

/**
 * Configure lead scoring rules
 */
export async function setLeadScoringRules(
  id: string,
  tenantId: string,
  rules: {
    engagement?: number;
    purchase?: number;
    signup?: number;
    openEmail?: number;
    clickEmail?: number;
    [key: string]: number | undefined;
  },
) {
  const workflow = await prisma.mrmAutomationWorkflow.findFirst({
    where: { id, tenantId },
  });

  if (!workflow) {
    throw AppError.notFound("Workflow niet gevonden");
  }

  return prisma.mrmAutomationWorkflow.update({
    where: { id },
    data: {
      enableLeadScoring: true,
      scoringRules: rules,
    },
  });
}

/**
 * Track workflow performance
 */
export async function trackWorkflowPerformance(
  id: string,
  tenantId: string,
  metrics: {
    sent?: number;
    opened?: number;
    clicked?: number;
    converted?: number;
  },
) {
  const workflow = await prisma.mrmAutomationWorkflow.findFirst({
    where: { id, tenantId },
  });

  if (!workflow) {
    throw AppError.notFound("Workflow niet gevonden");
  }

  return prisma.mrmAutomationWorkflow.update({
    where: { id },
    data: {
      ...(metrics.sent !== undefined && {
        totalSent: { increment: metrics.sent },
      }),
      ...(metrics.opened !== undefined && {
        opened: { increment: metrics.opened },
      }),
      ...(metrics.clicked !== undefined && {
        clicked: { increment: metrics.clicked },
      }),
      ...(metrics.converted !== undefined && {
        converted: { increment: metrics.converted },
      }),
    },
  });
}

/**
 * Get workflow performance metrics
 */
export async function getWorkflowMetrics(id: string, tenantId: string) {
  const workflow = await prisma.mrmAutomationWorkflow.findFirst({
    where: { id, tenantId },
  });

  if (!workflow) {
    throw AppError.notFound("Workflow niet gevonden");
  }

  return {
    id: workflow.id,
    name: workflow.name,
    totalSent: workflow.totalSent,
    opened: workflow.opened,
    clicked: workflow.clicked,
    converted: workflow.converted,
    openRate: workflow.totalSent > 0 ? (workflow.opened / workflow.totalSent) * 100 : 0,
    clickRate: workflow.totalSent > 0 ? (workflow.clicked / workflow.totalSent) * 100 : 0,
    conversionRate:
      workflow.totalSent > 0 ? (workflow.converted / workflow.totalSent) * 100 : 0,
    status: workflow.status,
    startedAt: workflow.startedAt,
  };
}

/**
 * Duplicate a workflow
 */
export async function duplicateWorkflow(id: string, tenantId: string) {
  const workflow = await prisma.mrmAutomationWorkflow.findFirst({
    where: { id, tenantId },
    include: {
      steps: true,
    },
  });

  if (!workflow) {
    throw AppError.notFound("Workflow niet gevonden");
  }

  const newWorkflow = await prisma.mrmAutomationWorkflow.create({
    data: {
      tenantId,
      campaignId: workflow.campaignId,
      name: `${workflow.name} (kopie)`,
      description: workflow.description,
      type: workflow.type,
      triggerType: workflow.triggerType,
      triggerConfig: workflow.triggerConfig,
      enableLeadScoring: workflow.enableLeadScoring,
      scoringRules: workflow.scoringRules,
      status: "DRAFT",
      steps: {
        create: workflow.steps.map((step) => ({
          stepNumber: step.stepNumber,
          action: step.action,
          actionConfig: step.actionConfig,
          delayMinutes: step.delayMinutes,
          condition: step.condition,
        })),
      },
    },
    include: {
      steps: true,
    },
  });

  return newWorkflow;
}

/**
 * Get active workflows (ACTIVE status)
 */
export async function getActiveWorkflows(tenantId: string) {
  return prisma.mrmAutomationWorkflow.findMany({
    where: {
      tenantId,
      status: "ACTIVE",
    },
    include: {
      steps: { orderBy: { stepNumber: "asc" } },
    },
    orderBy: { startedAt: "desc" },
  });
}
