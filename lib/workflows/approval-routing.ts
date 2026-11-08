import { z } from "zod";

export const ApprovalRouteSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  stepId: z.string().min(1),
  rules: z.object({
    condition: z.enum(["amount_threshold", "department", "role", "custom"]),
    value: z.unknown(),
    approvers: z.array(z.string()).min(1),
    parallel: z.boolean().default(false),
  }),
  priority: z.number().default(0),
  createdAt: z.date(),
});

export type ApprovalRoute = z.infer<typeof ApprovalRouteSchema>;

export async function resolveApprovers(
  routes: ApprovalRoute[],
  context: Record<string, unknown>
): Promise<string[]> {
  const matching = routes.filter((r) => evaluateRule(r.rules.condition, r.rules.value, context));
  if (matching.length === 0) return [];

  const sorted = matching.sort((a, b) => b.priority - a.priority);
  const topRoute = sorted[0];
  return topRoute.rules.approvers;
}

function evaluateRule(condition: string, value: unknown, context: Record<string, unknown>): boolean {
  switch (condition) {
    case "amount_threshold":
      return (context.amount as number) >= (value as number);
    case "department":
      return context.department === value;
    case "role":
      return context.role === value;
    case "custom":
      return true;
    default:
      return false;
  }
}

export async function createApprovalRoute(data: Omit<ApprovalRoute, "id" | "createdAt">): Promise<ApprovalRoute> {
  return {
    id: `ar_${Date.now()}`,
    ...data,
    createdAt: new Date(),
  };
}
