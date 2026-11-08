import { z } from "zod";

export const EscalationSchema = z.object({
  id: z.string().min(1),
  approvalId: z.string().min(1),
  level: z.number().min(1).max(5),
  triggerMinutes: z.number().min(1),
  escalateTo: z.array(z.string()).min(1),
  reason: z.string(),
  triggeredAt: z.date().optional(),
  status: z.enum(["pending", "triggered", "resolved"]),
  createdAt: z.date(),
});

export type Escalation = z.infer<typeof EscalationSchema>;

export async function createEscalation(
  approvalId: string,
  level: number,
  triggerMinutes: number,
  escalateTo: string[],
  reason: string
): Promise<Escalation> {
  return {
    id: `esc_${Date.now()}`,
    approvalId,
    level,
    triggerMinutes,
    escalateTo,
    reason,
    status: "pending",
    createdAt: new Date(),
  };
}

export async function checkEscalationTrigger(
  escalation: Escalation,
  createdAtApproval: Date,
  now: Date = new Date()
): Promise<boolean> {
  if (escalation.status !== "pending") return false;
  const elapsedMinutes = (now.getTime() - createdAtApproval.getTime()) / 60000;
  return elapsedMinutes >= escalation.triggerMinutes;
}

export async function triggerEscalation(escalation: Escalation): Promise<Escalation> {
  return {
    ...escalation,
    status: "triggered",
    triggeredAt: new Date(),
  };
}
