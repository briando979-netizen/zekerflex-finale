import { z } from "zod";

export const WorkflowAuditEntrySchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  approvalId: z.string().min(1),
  action: z.enum(["created", "routed", "approved", "rejected", "escalated", "completed"]),
  actor: z.object({
    userId: z.string(),
    role: z.string(),
    name: z.string(),
  }),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.date(),
  ipAddress: z.string().optional(),
});

export type WorkflowAuditEntry = z.infer<typeof WorkflowAuditEntrySchema>;

export async function createAuditEntry(data: Omit<WorkflowAuditEntry, "id" | "timestamp">): Promise<WorkflowAuditEntry> {
  return {
    id: `audit_${Date.now()}`,
    ...data,
    timestamp: new Date(),
  };
}

export async function getAuditTrail(approvalId: string): Promise<WorkflowAuditEntry[]> {
  // In production, fetch from database
  return [];
}

export async function getAuditTrailByWorkflow(workflowId: string): Promise<WorkflowAuditEntry[]> {
  // In production, fetch from database
  return [];
}

export async function logApproval(
  workflowId: string,
  approvalId: string,
  userId: string,
  role: string,
  name: string,
  decision: "approved" | "rejected",
  comment?: string
): Promise<WorkflowAuditEntry> {
  return createAuditEntry({
    workflowId,
    approvalId,
    action: decision === "approved" ? "approved" : "rejected",
    actor: { userId, role, name },
    metadata: { comment },
  });
}
