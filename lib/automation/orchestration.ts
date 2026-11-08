import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

// ============================================================================
// 2. PROCESS ORCHESTRATION - Multi-step workflows, parallel/sequential execution
// ============================================================================

export interface ExecutionContext {
  runId: string;
  workflowId: string;
  variables: Map<string, unknown>;
  history: ExecutionStep[];
}

export interface ExecutionStep {
  stepId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface ApprovalChain {
  stepId: string;
  approvers: string[];
  currentApproverIndex: number;
  approvedBy: string[];
  rejectionReason?: string;
  requiresAllApprovals: boolean;
}

/**
 * Orchestrate a workflow execution with proper sequencing
 */
export async function orchestrateWorkflow(
  tenantId: string,
  workflowId: string,
  inputData: Record<string, unknown>,
  triggeredBy: string = "SYSTEM"
) {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: {
        orderBy: { stepNumber: "asc" },
      },
    },
  });

  if (!workflow || workflow.tenantId !== tenantId) {
    throw new AppError.notFound("Workflow niet gevonden");
  }

  if (!workflow.enabled) {
    throw new AppError.validation("Workflow is uitgeschakeld");
  }

  // Create workflow run
  const run = await prisma.workflowRun.create({
    data: {
      workflowId,
      status: "RUNNING",
      triggeredBy,
      inputData: inputData as unknown,
      executionPath: [],
    },
  });

  try {
    const context: ExecutionContext = {
      runId: run.id,
      workflowId,
      variables: new Map(Object.entries(inputData)),
      history: [],
    };

    // Execute based on workflow type
    let result: Record<string, unknown>;
    switch (workflow.executionType) {
      case "SEQUENTIAL":
        result = await executeSequential(workflow, context);
        break;
      case "PARALLEL":
        result = await executeParallel(workflow, context);
        break;
      case "CONDITIONAL":
        result = await executeConditional(workflow, context);
        break;
      default:
        throw new AppError.internal(`Unknown execution type: ${workflow.executionType}`);
    }

    // Update run with completion
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        outputData: result as unknown,
        completedAt: new Date(),
        duration: Date.now() - run.createdAt.getTime(),
        executionPath: context.history.map((h) => h.stepId),
      },
    });

    return {
      runId: run.id,
      status: "COMPLETED",
      output: result,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await prisma.workflowRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        failureReason: errorMessage,
        completedAt: new Date(),
        duration: Date.now() - run.createdAt.getTime(),
      },
    });

    throw error;
  }
}

/**
 * Execute workflow steps sequentially
 */
async function executeSequential(
  workflow: {
    id: string;
    executionType: string;
    maxRetries: number;
    steps: Array<{
      id: string;
      stepNumber: number;
      name: string;
      config: unknown;
      onSuccess?: string;
      onFailure?: string;
      maxRetries: number;
    }>;
  },
  context: ExecutionContext
) {
  let currentStepIndex = 0;
  const output: Record<string, unknown> = {};

  while (currentStepIndex < workflow.steps.length) {
    const step = workflow.steps[currentStepIndex];

    try {
      const result = await executeStep(step, context, workflow.maxRetries);
      output[step.name] = result;
      currentStepIndex++;
    } catch (error) {
      const stepConfig = step as Record<string, unknown>;
      if (stepConfig.onFailure) {
        // Jump to failure handler step
        const failureStepIndex = workflow.steps.findIndex(
          (s) => s.id === stepConfig.onFailure
        );
        if (failureStepIndex >= 0) {
          currentStepIndex = failureStepIndex;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  return output;
}

/**
 * Execute workflow steps in parallel
 */
async function executeParallel(
  workflow: {
    id: string;
    executionType: string;
    maxRetries: number;
    steps: Array<{
      id: string;
      stepNumber: number;
      name: string;
      config: unknown;
      isParallel?: boolean;
      parallelBranches?: string[];
      maxRetries: number;
    }>;
  },
  context: ExecutionContext
) {
  const output: Record<string, unknown> = {};
  const parallelGroups = groupParallelSteps(workflow.steps);

  for (const group of parallelGroups) {
    const promises = group.map((step) =>
      executeStep(step, context, workflow.maxRetries)
        .then((result) => {
          output[step.name] = result;
        })
        .catch((error) => {
          throw new AppError.validation(`Step ${step.name} failed: ${error.message}`);
        })
    );

    await Promise.all(promises);
  }

  return output;
}

/**
 * Execute workflow with conditional branching
 */
async function executeConditional(
  workflow: {
    id: string;
    executionType: string;
    maxRetries: number;
    steps: Array<{
      id: string;
      stepNumber: number;
      name: string;
      config: unknown;
      condition?: string;
      onSuccess?: string;
      onFailure?: string;
      maxRetries: number;
    }>;
  },
  context: ExecutionContext
) {
  const output: Record<string, unknown> = {};
  let currentStepIndex = 0;

  while (currentStepIndex < workflow.steps.length) {
    const step = workflow.steps[currentStepIndex];

    // Evaluate condition if present
    if (step.condition && !evaluateCondition(step.condition, context.variables)) {
      currentStepIndex++;
      continue;
    }

    try {
      const result = await executeStep(step, context, workflow.maxRetries);
      output[step.name] = result;

      // Use onSuccess to jump to next step
      if (step.onSuccess) {
        const nextIndex = workflow.steps.findIndex((s) => s.id === step.onSuccess);
        if (nextIndex >= 0) {
          currentStepIndex = nextIndex;
        } else {
          currentStepIndex++;
        }
      } else {
        currentStepIndex++;
      }
    } catch (error) {
      if (step.onFailure) {
        const failureIndex = workflow.steps.findIndex((s) => s.id === step.onFailure);
        if (failureIndex >= 0) {
          currentStepIndex = failureIndex;
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }
  }

  return output;
}

/**
 * Execute a single workflow step
 */
async function executeStep(
  step: {
    id: string;
    name: string;
    config: unknown;
    maxRetries: number;
  },
  context: ExecutionContext,
  workflowMaxRetries: number
): Promise<unknown> {
  const maxRetries = (step as Record<string, unknown>).maxRetries || workflowMaxRetries;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await executeStepAction(step.config as Record<string, unknown>);

      // Store in context
      context.variables.set(`${step.name}_output`, result);
      context.history.push({
        stepId: step.id,
        status: "COMPLETED",
        input: {},
        output: result as Record<string, unknown>,
        startedAt: new Date(),
        completedAt: new Date(),
      });

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delayMs = (step as Record<string, unknown>).retryDelayMs as number || 1000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error("Step execution failed");
}

/**
 * Execute the actual step action (delegated to integrations)
 */
async function executeStepAction(config: Record<string, unknown>): Promise<unknown> {
  const actionType = config.actionType as string;

  switch (actionType) {
    case "SEND_EMAIL":
      return await sendEmailAction(config);
    case "CALL_API":
      return await callApiAction(config);
    case "TRANSFORM_DATA":
      return await transformDataAction(config);
    case "UPDATE_RECORD":
      return await updateRecordAction(config);
    case "CREATE_RECORD":
      return await createRecordAction(config);
    default:
      throw new AppError.validation(`Unknown action type: ${actionType}`);
  }
}

/**
 * Built-in actions
 */
async function sendEmailAction(config: Record<string, unknown>): Promise<void> {
  // Placeholder - actual implementation in integrations
  console.log("Sending email:", config);
}

async function callApiAction(config: Record<string, unknown>): Promise<unknown> {
  const url = config.url as string;
  const method = (config.method as string) || "GET";
  const body = config.body as Record<string, unknown>;

  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`API call failed: ${response.statusText}`);
  }

  return await response.json();
}

async function transformDataAction(config: Record<string, unknown>): Promise<unknown> {
  // Placeholder for data transformation
  return config.output || {};
}

async function updateRecordAction(config: Record<string, unknown>): Promise<void> {
  console.log("Updating record:", config);
}

async function createRecordAction(config: Record<string, unknown>): Promise<void> {
  console.log("Creating record:", config);
}

/**
 * Evaluate condition expression
 */
function evaluateCondition(
  condition: string,
  variables: Map<string, unknown>
): boolean {
  try {
    // Simple expression evaluator - can be enhanced with safer parsing
    const varMap = Object.fromEntries(variables);
    const func = new Function(...Object.keys(varMap), `return ${condition}`);
    return func(...Object.values(varMap)) as boolean;
  } catch {
    return false;
  }
}

/**
 * Group steps by parallel execution boundaries
 */
function groupParallelSteps(
  steps: Array<{
    id: string;
    isParallel?: boolean;
  }>
): Array<Array<{ id: string; isParallel?: boolean }>> {
  const groups: Array<Array<{ id: string; isParallel?: boolean }>> = [];
  let currentGroup: Array<{ id: string; isParallel?: boolean }> = [];

  for (const step of steps) {
    if (step.isParallel && currentGroup.length > 0) {
      currentGroup.push(step);
    } else {
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
      currentGroup = [step];
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
}

/**
 * Request approval for a workflow step
 */
export async function requestApproval(
  runId: string,
  stepId: string,
  approvers: string[]
) {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
  });

  if (!run) {
    throw new AppError.notFound("Run niet gevonden");
  }

  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      pendingApprovals: approvers,
    },
  });

  return { runId, stepId, approvers };
}

/**
 * Approve a workflow step
 */
export async function approveStep(
  runId: string,
  approverUserId: string
) {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
  });

  if (!run) {
    throw new AppError.notFound("Run niet gevonden");
  }

  const pending = (run.pendingApprovals as string[]) || [];
  const approved = (run.approvedBy as string[]) || [];

  if (!pending.includes(approverUserId)) {
    throw new AppError.validation("Gebruiker is geen fiatteur");
  }

  const updatedPending = pending.filter((p) => p !== approverUserId);
  const updatedApproved = [...approved, approverUserId];

  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      pendingApprovals: updatedPending,
      approvedBy: updatedApproved,
    },
  });

  return { approved: true };
}

/**
 * Reject a workflow step
 */
export async function rejectStep(
  runId: string,
  approverUserId: string,
  reason: string
) {
  const run = await prisma.workflowRun.findUnique({
    where: { id: runId },
  });

  if (!run) {
    throw new AppError.notFound("Run niet gevonden");
  }

  await prisma.workflowRun.update({
    where: { id: runId },
    data: {
      status: "FAILED",
      rejectionReason: reason,
      pendingApprovals: [],
    },
  });

  return { approved: false, reason };
}
