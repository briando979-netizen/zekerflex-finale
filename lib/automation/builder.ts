import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

// ============================================================================
// 1. WORKFLOW BUILDER - Visual/Code Workflow Designer
// ============================================================================

// Workflow canvas node types
export type NodeType = "trigger" | "action" | "condition" | "approval" | "loop" | "transform" | "endpoint";

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
  connections?: string[]; // IDs of connected nodes
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string; // Conditional logic for edges
}

export interface WorkflowCanvas {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: WorkflowVariable[];
}

export interface WorkflowVariable {
  id: string;
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  defaultValue?: unknown;
  source?: "input" | "step_output" | "connector";
}

// Validation schemas
export const workflowNodeSchema = z.object({
  id: z.string(),
  type: z.enum(["trigger", "action", "condition", "approval", "loop", "transform", "endpoint"]),
  label: z.string(),
  config: z.record(z.unknown()),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  connections: z.array(z.string()).optional(),
});

export const workflowCanvasSchema = z.object({
  nodes: z.array(workflowNodeSchema),
  edges: z.array(
    z.object({
      id: z.string(),
      source: z.string(),
      target: z.string(),
      condition: z.string().optional(),
    })
  ),
  variables: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.enum(["string", "number", "boolean", "object", "array"]),
      defaultValue: z.unknown().optional(),
      source: z.enum(["input", "step_output", "connector"]).optional(),
    })
  ),
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1, "Werkstroompnaam is verplicht"),
  description: z.string().optional(),
  triggerType: z.enum(["MANUAL", "SCHEDULED", "EVENT_BASED", "WEBHOOK", "CONDITION_MET"]),
  executionType: z.enum(["SEQUENTIAL", "PARALLEL", "CONDITIONAL"]),
  definition: workflowCanvasSchema,
  cronExpression: z.string().optional(),
  requiresApproval: z.boolean().optional(),
  maxRetries: z.number().int().min(0).max(10),
});

/**
 * Create a new workflow with visual canvas definition
 */
export async function createWorkflow(
  tenantId: string,
  input: z.infer<typeof createWorkflowSchema>
) {
  const validated = createWorkflowSchema.parse(input);

  // Validate canvas structure
  validateWorkflowCanvas(validated.definition);

  const workflow = await prisma.workflow.create({
    data: {
      tenantId,
      name: validated.name,
      description: validated.description,
      triggerType: validated.triggerType,
      executionType: validated.executionType,
      definition: validated.definition as unknown,
      cronExpression: validated.cronExpression,
      requiresApproval: validated.requiresApproval ?? false,
      maxRetries: validated.maxRetries,
    },
    include: {
      steps: true,
      metrics: true,
    },
  });

  return workflow;
}

/**
 * Update an existing workflow
 */
export async function updateWorkflow(
  tenantId: string,
  workflowId: string,
  input: Partial<z.infer<typeof createWorkflowSchema>>
) {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
  });

  if (!workflow || workflow.tenantId !== tenantId) {
    throw new AppError.notFound("Workflow niet gevonden");
  }

  if (input.definition) {
    validateWorkflowCanvas(input.definition);
  }

  return await prisma.workflow.update({
    where: { id: workflowId },
    data: {
      ...input,
      definition: input.definition as unknown,
      version: { increment: 1 },
    },
  });
}

/**
 * Get workflow with full definition
 */
export async function getWorkflow(tenantId: string, workflowId: string) {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      steps: {
        orderBy: { stepNumber: "asc" },
      },
      runs: {
        take: 10,
        orderBy: { createdAt: "desc" },
      },
      metrics: {
        orderBy: { date: "desc" },
        take: 30,
      },
    },
  });

  if (!workflow || workflow.tenantId !== tenantId) {
    throw new AppError.notFound("Workflow niet gevonden");
  }

  return workflow;
}

/**
 * List all workflows for a tenant
 */
export async function listWorkflows(
  tenantId: string,
  options?: { archived?: boolean; enabled?: boolean }
) {
  return await prisma.workflow.findMany({
    where: {
      tenantId,
      ...(options?.archived !== undefined && { isArchived: options.archived }),
      ...(options?.enabled !== undefined && { enabled: options.enabled }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      metrics: {
        take: 1,
        orderBy: { date: "desc" },
      },
    },
  });
}

/**
 * Validate workflow canvas structure
 */
function validateWorkflowCanvas(canvas: WorkflowCanvas) {
  if (!canvas.nodes || canvas.nodes.length === 0) {
    throw new AppError.validation("Workflow moet minstens één knooppunt hebben");
  }

  // Check for trigger node
  const hasTrigger = canvas.nodes.some((n) => n.type === "trigger");
  if (!hasTrigger) {
    throw new AppError.validation("Workflow moet een trigger-knooppunt hebben");
  }

  // Check for endpoint node
  const hasEndpoint = canvas.nodes.some((n) => n.type === "endpoint");
  if (!hasEndpoint) {
    throw new AppError.validation("Workflow moet een eindknooppunt hebben");
  }

  // Validate edges reference existing nodes
  const nodeIds = new Set(canvas.nodes.map((n) => n.id));
  for (const edge of canvas.edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new AppError.validation("Ongeldige verbinding tussen knooppunten");
    }
  }

  // Validate variable references
  const varNames = new Set(canvas.variables.map((v) => v.name));
  for (const node of canvas.nodes) {
    if (node.config.variables) {
      const refVars = node.config.variables as string[];
      for (const varRef of refVars) {
        if (!varNames.has(varRef)) {
          throw new AppError.validation(`Variabele '${varRef}' niet gedefinieerd`);
        }
      }
    }
  }
}

/**
 * Clone a workflow (create a new version)
 */
export async function cloneWorkflow(
  tenantId: string,
  workflowId: string,
  newName: string
) {
  const workflow = await getWorkflow(tenantId, workflowId);

  const cloned = await prisma.workflow.create({
    data: {
      tenantId,
      name: newName,
      description: workflow.description,
      triggerType: workflow.triggerType,
      executionType: workflow.executionType,
      definition: workflow.definition,
      cronExpression: workflow.cronExpression,
      requiresApproval: workflow.requiresApproval,
      maxRetries: workflow.maxRetries,
      parentWorkflowId: workflowId,
    },
  });

  return cloned;
}

/**
 * Build workflow from template
 */
export async function buildFromTemplate(
  tenantId: string,
  templateKey: string,
  customConfig?: Record<string, unknown>
) {
  const templates: Record<string, WorkflowCanvas> = {
    email_on_event: {
      nodes: [
        {
          id: "trigger_1",
          type: "trigger",
          label: "Event empfangen",
          config: { eventType: "NEW_BOOKING" },
        },
        {
          id: "action_1",
          type: "action",
          label: "E-mail verzenden",
          config: { actionType: "SEND_EMAIL", to: "${event.email}", template: "booking_confirmation" },
        },
        {
          id: "end_1",
          type: "endpoint",
          label: "Voltooid",
          config: {},
        },
      ],
      edges: [
        { id: "edge_1", source: "trigger_1", target: "action_1" },
        { id: "edge_2", source: "action_1", target: "end_1" },
      ],
      variables: [
        {
          id: "var_1",
          name: "event",
          type: "object",
          source: "input",
        },
      ],
    },
    approval_workflow: {
      nodes: [
        {
          id: "trigger_2",
          type: "trigger",
          label: "Handmatig gestart",
          config: {},
        },
        {
          id: "approval_1",
          type: "approval",
          label: "Goedkeuring vereist",
          config: { approvers: ["${admin_users}"] },
        },
        {
          id: "action_2",
          type: "action",
          label: "Actie uitvoeren",
          config: { actionType: "UPDATE_RECORD" },
        },
        {
          id: "end_2",
          type: "endpoint",
          label: "Voltooid",
          config: {},
        },
      ],
      edges: [
        { id: "edge_3", source: "trigger_2", target: "approval_1" },
        { id: "edge_4", source: "approval_1", target: "action_2" },
        { id: "edge_5", source: "action_2", target: "end_2" },
      ],
      variables: [],
    },
  };

  const template = templates[templateKey];
  if (!template) {
    throw new AppError.validation(`Template '${templateKey}' niet gevonden`);
  }

  const definition = {
    ...template,
    ...customConfig,
  };

  return await createWorkflow(tenantId, {
    name: `Workflow van ${templateKey}`,
    triggerType: "MANUAL",
    executionType: "SEQUENTIAL",
    definition,
    maxRetries: 3,
  });
}

/**
 * Export workflow as JSON (for version control/backup)
 */
export function exportWorkflow(workflow: {
  id: string;
  name: string;
  definition: unknown;
}) {
  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    workflow: {
      id: workflow.id,
      name: workflow.name,
      definition: workflow.definition,
    },
  };
}

/**
 * Import workflow from JSON
 */
export async function importWorkflow(
  tenantId: string,
  importData: Record<string, unknown>
) {
  if (typeof importData.workflow !== "object" || !importData.workflow) {
    throw new AppError.validation("Ongeldige import-indeling");
  }

  const workflowData = importData.workflow as Record<string, unknown>;
  const definition = workflowData.definition;

  if (typeof definition !== "object" || !definition) {
    throw new AppError.validation("Workflow-definitie is verplicht");
  }

  return await createWorkflow(tenantId, {
    name: (workflowData.name as string) || "Geïmporteerde workflow",
    triggerType: "MANUAL",
    executionType: "SEQUENTIAL",
    definition: definition as WorkflowCanvas,
    maxRetries: 3,
  });
}
