import { z } from "zod";

export const WorkflowStepSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["approval", "notification", "task", "condition"]),
  label: z.string(),
  rules: z.record(z.unknown()).optional(),
  nextSteps: z.array(z.string()).optional(),
});

export const WorkflowDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(WorkflowStepSchema).min(1),
  triggers: z.array(z.enum(["manual", "auto", "scheduled"])),
  status: z.enum(["draft", "active", "archived"]),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export async function createWorkflow(
  data: Omit<WorkflowDefinition, "id" | "createdAt" | "updatedAt">
): Promise<WorkflowDefinition> {
  return {
    id: `wf_${Date.now()}`,
    ...data,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function validateWorkflow(def: WorkflowDefinition): Promise<boolean> {
  if (def.steps.length === 0) return false;
  const stepIds = new Set(def.steps.map((s) => s.id));
  for (const step of def.steps) {
    if (step.nextSteps) {
      for (const nextId of step.nextSteps) {
        if (!stepIds.has(nextId)) return false;
      }
    }
  }
  return true;
}
