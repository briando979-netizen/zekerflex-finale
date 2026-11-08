import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { CSPlaybook, PlaybookInstance } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Playbooks Module
//
// Template-driven playbooks for onboarding, expansion, retention, and winback.
// Manages playbook lifecycle, step execution, and automation workflows.
// ---------------------------------------------------------------------------

export const PlaybookStepSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  action: z.enum(["email", "call", "task", "milestone"]),
  metadata: z.record(z.any()).optional(),
  daysAfterStart: z.number().int().min(0).default(0),
});

export type PlaybookStep = z.infer<typeof PlaybookStepSchema>;

export const CreatePlaybookSchema = z.object({
  name: z.string(),
  type: z.enum(["ONBOARDING", "EXPANSION", "RETENTION", "WINBACK", "UPSELL", "ENGAGEMENT"]),
  targetTiers: z.array(z.string()).default([]),
  targetIndustries: z.array(z.string()).default([]),
  steps: z.array(PlaybookStepSchema),
  successMetrics: z.array(z.string()).default([]),
});

export type CreatePlaybookInput = z.infer<typeof CreatePlaybookSchema>;

/**
 * Create a new playbook template.
 */
export async function createPlaybook(
  input: CreatePlaybookInput,
  createdById?: string,
): Promise<CSPlaybook> {
  try {
    const validated = CreatePlaybookSchema.parse(input);

    const playbook = await prisma.cSPlaybook.create({
      data: {
        name: validated.name,
        type: validated.type,
        targetTiers: validated.targetTiers,
        targetIndustries: validated.targetIndustries,
        createdById,
        successMetrics: validated.successMetrics,
        steps: {
          createMany: {
            data: validated.steps.map((step, idx) => ({
              sequenceNumber: idx + 1,
              title: step.title,
              description: step.description ?? null,
              action: step.action,
              metadata: step.metadata ?? null,
              daysAfterStart: step.daysAfterStart,
            })),
          },
        },
      },
      include: { steps: true },
    });

    logger.info("Playbook created", {
      playbookId: playbook.id,
      type: validated.type,
      stepCount: playbook.steps.length,
    });

    return playbook;
  } catch (err) {
    logger.error("Failed to create playbook", {
      error: (err as Error).message,
    });
    throw AppError.validation("Playbook maken mislukt.");
  }
}

/**
 * Get playbook by ID.
 */
export async function getPlaybook(id: string): Promise<CSPlaybook | null> {
  return prisma.cSPlaybook.findUnique({
    where: { id },
    include: { steps: { orderBy: { sequenceNumber: "asc" } } },
  });
}

/**
 * List playbooks by type.
 */
export async function listPlaybooksByType(type: string, limit = 50): Promise<CSPlaybook[]> {
  return prisma.cSPlaybook.findMany({
    where: {
      type: type as any,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { steps: true },
  });
}

/**
 * Start a playbook instance for a tenant.
 */
export async function startPlaybookInstance(
  playbookId: string,
  tenantId: string,
): Promise<PlaybookInstance> {
  try {
    const playbook = await getPlaybook(playbookId);
    if (!playbook) throw AppError.notFound("Playbook niet gevonden.");

    // Check if instance already exists
    let instance = await prisma.playbookInstance.findUnique({
      where: {
        playbookId_tenantId: {
          playbookId,
          tenantId,
        },
      },
    });

    if (instance && instance.status === "ACTIVE") {
      return instance;
    }

    // Create new instance
    instance = await prisma.playbookInstance.create({
      data: {
        playbookId,
        tenantId,
        status: "ACTIVE",
        currentStep: playbook.steps.length > 0 ? 1 : 0,
      },
    });

    logger.info("Playbook instance started", {
      instanceId: instance.id,
      playbookId,
      tenantId,
    });

    return instance;
  } catch (err) {
    logger.error("Failed to start playbook instance", {
      playbookId,
      tenantId,
      error: (err as Error).message,
    });
    throw AppError.internal("Playbook starten mislukt.");
  }
}

/**
 * Advance playbook to next step.
 */
export async function advancePlaybookStep(instanceId: string): Promise<PlaybookInstance> {
  const instance = await prisma.playbookInstance.findUnique({
    where: { id: instanceId },
    include: {
      playbook: { include: { steps: true } },
    },
  });

  if (!instance) throw AppError.notFound("Playbook-instantie niet gevonden.");

  const totalSteps = instance.playbook.steps.length;
  const nextStep = instance.currentStep + 1;

  const isComplete = nextStep > totalSteps;

  const updated = await prisma.playbookInstance.update({
    where: { id: instanceId },
    data: {
      currentStep: nextStep,
      completedSteps: [...(instance.completedSteps || []), instance.currentStep],
      ...(isComplete && {
        status: "COMPLETED",
        completedAt: new Date(),
      }),
    },
  });

  logger.info("Playbook advanced", {
    instanceId,
    step: nextStep,
    total: totalSteps,
    completed: isComplete,
  });

  return updated;
}

/**
 * Complete a playbook instance.
 */
export async function completePlaybookInstance(instanceId: string): Promise<PlaybookInstance> {
  return prisma.playbookInstance.update({
    where: { id: instanceId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });
}

/**
 * Get active playbooks for a tenant.
 */
export async function getTenantPlaybookInstances(
  tenantId: string,
  status?: string,
): Promise<PlaybookInstance[]> {
  return prisma.playbookInstance.findMany({
    where: {
      tenantId,
      ...(status && { status: status as any }),
    },
    include: {
      playbook: { include: { steps: true } },
    },
    orderBy: { startedAt: "desc" },
  });
}

/**
 * Get playbooks due for next action (based on daysAfterStart).
 */
export async function getPlaybooksDueForAction(
  limit = 50,
): Promise<(PlaybookInstance & { nextAction?: any })[]> {
  const now = new Date();

  const instances = await prisma.playbookInstance.findMany({
    where: { status: "ACTIVE" },
    include: {
      playbook: { include: { steps: true } },
    },
    take: limit,
  });

  return instances
    .map((instance) => {
      const currentStep = instance.playbook.steps[instance.currentStep - 1];
      if (!currentStep) return null;

      const actionDueDate = new Date(instance.startedAt);
      actionDueDate.setDate(actionDueDate.getDate() + currentStep.daysAfterStart);

      const isDue = actionDueDate <= now;

      return isDue ? { ...instance, nextAction: currentStep } : null;
    })
    .filter((item) => item !== null) as any[];
}

/**
 * Archive completed playbook instances older than 90 days.
 */
export async function archiveOldPlaybookInstances(
  daysOld = 90,
): Promise<{ archived: number }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await prisma.playbookInstance.updateMany({
    where: {
      status: "COMPLETED",
      completedAt: { lt: cutoffDate },
    },
    data: { status: "ARCHIVED" },
  });

  logger.info("Playbook instances archived", { count: result.count });

  return { archived: result.count };
}
