import { prisma } from "@/lib/prisma";
import { getPlan, type ApiPlan } from "@/lib/api-plans/catalog";

/** The plan governing a tenant-scoped API key — no row, or a non-active row, means the free plan. */
export async function resolveTenantPlan(tenantId: string): Promise<ApiPlan> {
  const sub = await prisma.apiSubscription.findUnique({
    where: { tenantId },
    select: { planKey: true, status: true },
  });
  if (!sub || sub.status !== "active") return getPlan("free");
  return getPlan(sub.planKey);
}
