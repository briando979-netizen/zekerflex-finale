import { z } from "zod";

export const WorkflowTriggerSchema = z.enum(["webhook", "schedule", "event", "manual", "conditional", "data_change"]);
export type WorkflowTrigger = z.infer<typeof WorkflowTriggerSchema>;

export const WorkflowActionSchema = z.enum(["email", "sms", "create_record", "update_record", "delete_record", "webhook", "notification"]);
export type WorkflowAction = z.infer<typeof WorkflowActionSchema>;

export interface WorkflowNode {
  id: string;
  type: "trigger" | "condition" | "action" | "loop" | "error_handler";
  label: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  condition?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: "pending" | "running" | "success" | "failed" | "error";
  startedAt: Date;
  completedAt?: Date;
  logs: ExecutionLog[];
  error?: string;
  result?: Record<string, unknown>;
}

export interface ExecutionLog {
  timestamp: Date;
  nodeId: string;
  message: string;
  level: "info" | "warn" | "error";
  data?: Record<string, unknown>;
}

export interface TriggerConfig {
  type: WorkflowTrigger;
  config: Record<string, unknown>;
}

export interface ActionConfig {
  type: WorkflowAction;
  config: Record<string, unknown>;
}

export interface ConditionConfig {
  operator: "and" | "or";
  conditions: Condition[];
}

export interface Condition {
  field: string;
  operator: "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains" | "matches";
  value: unknown;
}

export interface LoopConfig {
  items: string;
  currentItem: string;
  maxIterations: number;
}
