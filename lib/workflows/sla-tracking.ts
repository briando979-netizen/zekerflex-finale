import { z } from "zod";

export const SLASchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  approvalId: z.string().min(1),
  responseTimeMinutes: z.number().min(1),
  resolutionTimeMinutes: z.number().min(1),
  createdAt: z.date(),
  dueDate: z.date(),
  breachedAt: z.date().optional(),
  status: z.enum(["active", "breached", "resolved"]),
});

export type SLA = z.infer<typeof SLASchema>;

export async function createSLA(
  workflowId: string,
  approvalId: string,
  responseTimeMinutes: number,
  resolutionTimeMinutes: number
): Promise<SLA> {
  const now = new Date();
  const dueDate = new Date(now.getTime() + resolutionTimeMinutes * 60000);

  return {
    id: `sla_${Date.now()}`,
    workflowId,
    approvalId,
    responseTimeMinutes,
    resolutionTimeMinutes,
    createdAt: now,
    dueDate,
    status: "active",
  };
}

export async function checkSLABreach(sla: SLA, now: Date = new Date()): Promise<boolean> {
  if (sla.status !== "active") return false;
  return now > sla.dueDate;
}

export async function getSLAStatus(sla: SLA, now: Date = new Date()): Promise<"on_track" | "at_risk" | "breached"> {
  if (sla.status === "breached" || sla.breachedAt) return "breached";
  const riskWindow = new Date(sla.dueDate.getTime() - 15 * 60000);
  if (now > riskWindow) return "at_risk";
  return "on_track";
}
