/**
 * Workflow Builder — Visual flow editor for creating automation workflows
 * CRUD operations, validation, and workflow composition.
 */

import { prisma } from "@/lib/prisma";
import { Workflow } from "@prisma/client";

export interface WorkflowStep {
  id: string;
  connector: string;
  action: string;
  inputMapping: Record<string, unknown>;
  errorHandling?: {
    strategy: "STOP" | "SKIP" | "RETRY";
    maxRetries?: number;
    fallbackValue?: unknown;
  };
  condition?: string; // JS expression or condition string
}

export interface WorkflowTrigger {
  type: "webhook" | "schedule" | "manual" | "event";
  connector?: string;
  config: Record<string, unknown>;
}

export interface WorkflowDefinition {
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  errorStrategy?: "STOP" | "RETRY" | "SKIP" | "FALLBACK";
  retryConfig?: {
    maxRetries: number;
    backoffType: "linear" | "exponential";
    initialDelayMs: number;
  };
  rateLimit?: number; // Max executions per minute
  timeout?: number; // Seconds
  tags?: string[];
}

/**
 * Create a new workflow
 */
export async function createWorkflow(
  tenantId: string,
  definition: WorkflowDefinition
): Promise<Workflow> {
  // Validate workflow definition
  validateWorkflowDefinition(definition);

  return prisma.workflow.create({
    data: {
      tenantId,
      name: definition.name,
      description: definition.description,
      triggerConfig: definition.trigger,
      steps: definition.steps,
      errorStrategy: definition.errorStrategy ?? "STOP",
      retryConfig: definition.retryConfig,
      rateLimit: definition.rateLimit,
      timeout: definition.timeout ?? 300,
      tags: definition.tags ?? [],
      enabled: true,
    },
  });
}

/**
 * Get workflow by ID
 */
export async function getWorkflow(workflowId: string): Promise<Workflow | null> {
  return prisma.workflow.findUnique({
    where: { id: workflowId },
  });
}

/**
 * List workflows for a tenant
 */
export async function listWorkflows(
  tenantId: string,
  options?: {
    enabled?: boolean;
    tags?: string[];
    limit?: number;
    offset?: number;
  }
): Promise<Workflow[]> {
  return prisma.workflow.findMany({
    where: {
      tenantId,
      enabled: options?.enabled,
      tags: options?.tags ? { hasSome: options.tags } : undefined,
    },
    take: options?.limit ?? 50,
    skip: options?.offset ?? 0,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Update workflow
 */
export async function updateWorkflow(
  workflowId: string,
  updates: Partial<WorkflowDefinition>
): Promise<Workflow> {
  const current = await getWorkflow(workflowId);
  if (!current) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  const merged: WorkflowDefinition = {
    name: updates.name ?? current.name,
    description: updates.description ?? current.description ?? undefined,
    trigger: updates.trigger ?? (current.triggerConfig as WorkflowTrigger),
    steps: updates.steps ?? (current.steps as WorkflowStep[]),
    errorStrategy: updates.errorStrategy ?? (current.errorStrategy as "STOP" | "RETRY" | "SKIP" | "FALLBACK"),
    retryConfig: updates.retryConfig ?? (current.retryConfig as unknown as {
      maxRetries: number;
      backoffType: "linear" | "exponential";
      initialDelayMs: number;
    } | undefined),
    rateLimit: updates.rateLimit ?? current.rateLimit ?? undefined,
    timeout: updates.timeout ?? current.timeout,
    tags: updates.tags ?? current.tags,
  };

  validateWorkflowDefinition(merged);

  return prisma.workflow.update({
    where: { id: workflowId },
    data: {
      name: merged.name,
      description: merged.description,
      triggerConfig: merged.trigger,
      steps: merged.steps,
      errorStrategy: merged.errorStrategy,
      retryConfig: merged.retryConfig,
      rateLimit: merged.rateLimit,
      timeout: merged.timeout,
      tags: merged.tags,
    },
  });
}

/**
 * Enable/disable workflow
 */
export async function setWorkflowEnabled(
  workflowId: string,
  enabled: boolean
): Promise<Workflow> {
  return prisma.workflow.update({
    where: { id: workflowId },
    data: { enabled },
  });
}

/**
 * Delete workflow
 */
export async function deleteWorkflow(workflowId: string): Promise<void> {
  await prisma.workflow.delete({
    where: { id: workflowId },
  });
}

/**
 * Clone workflow
 */
export async function cloneWorkflow(
  workflowId: string,
  newName: string,
  tenantId: string
): Promise<Workflow> {
  const original = await getWorkflow(workflowId);
  if (!original) {
    throw new Error(`Workflow not found: ${workflowId}`);
  }

  return prisma.workflow.create({
    data: {
      tenantId,
      name: newName,
      description: original.description,
      triggerConfig: original.triggerConfig,
      steps: original.steps,
      errorStrategy: original.errorStrategy,
      retryConfig: original.retryConfig,
      rateLimit: original.rateLimit,
      timeout: original.timeout,
      tags: original.tags,
      enabled: false, // Cloned workflows start disabled
    },
  });
}

/**
 * Get workflow execution history
 */
export async function getWorkflowExecutionHistory(
  workflowId: string,
  limit: number = 50
) {
  return prisma.workflowExecution.findMany({
    where: { workflowId },
    take: limit,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Validate workflow definition
 */
function validateWorkflowDefinition(definition: WorkflowDefinition): void {
  if (!definition.name || definition.name.trim() === "") {
    throw new Error("Workflow name is required");
  }

  if (!definition.trigger) {
    throw new Error("Workflow trigger is required");
  }

  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    throw new Error("At least one workflow step is required");
  }

  // Validate steps
  for (let i = 0; i < definition.steps.length; i++) {
    const step = definition.steps[i];
    if (!step.id) {
      throw new Error(`Step ${i} is missing an id`);
    }
    if (!step.connector) {
      throw new Error(`Step ${i} is missing a connector`);
    }
    if (!step.action) {
      throw new Error(`Step ${i} is missing an action`);
    }
  }

  // Validate error strategy
  const validStrategies = ["STOP", "RETRY", "SKIP", "FALLBACK"];
  if (definition.errorStrategy && !validStrategies.includes(definition.errorStrategy)) {
    throw new Error(`Invalid error strategy: ${definition.errorStrategy}`);
  }

  // Validate timeout
  if (definition.timeout && definition.timeout < 1) {
    throw new Error("Timeout must be at least 1 second");
  }

  // Validate rate limit
  if (definition.rateLimit && definition.rateLimit < 1) {
    throw new Error("Rate limit must be at least 1 request per minute");
  }
}

/**
 * Export workflow as JSON
 */
export function exportWorkflow(workflow: Workflow): string {
  const definition: WorkflowDefinition = {
    name: workflow.name,
    description: workflow.description ?? undefined,
    trigger: workflow.triggerConfig as WorkflowTrigger,
    steps: workflow.steps as WorkflowStep[],
    errorStrategy: workflow.errorStrategy as "STOP" | "RETRY" | "SKIP" | "FALLBACK",
    retryConfig: workflow.retryConfig as unknown as {
      maxRetries: number;
      backoffType: "linear" | "exponential";
      initialDelayMs: number;
    } | undefined,
    rateLimit: workflow.rateLimit ?? undefined,
    timeout: workflow.timeout,
    tags: workflow.tags,
  };

  return JSON.stringify(definition, null, 2);
}

/**
 * Import workflow from JSON
 */
export async function importWorkflow(
  tenantId: string,
  json: string
): Promise<Workflow> {
  const definition = JSON.parse(json) as WorkflowDefinition;
  return createWorkflow(tenantId, definition);
}
