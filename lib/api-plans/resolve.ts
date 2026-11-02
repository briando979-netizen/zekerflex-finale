import { prisma } from "@/lib/prisma";
import { getPlan, type ApiPlan } from "@/lib/api-plans/catalog";
import { isCompTenant } from "@/lib/billing/comp";

/** The plan governing a tenant-scoped API key — no row, or a non-active row, means the free plan.
 *  A free (comp) company gets the top plan without a subscription (lib/billing/comp). */
export async function resolveTenantPlan(tenantId: string): Promise<ApiPlan> {
  if (await isCompTenant(tenantId)) return getPlan("scale");
  const sub = await prisma.apiSubscription.findUnique({
    where: { tenantId },
    select: { planKey: true, status: true },
  });
  if (!sub || sub.status !== "active") return getPlan("free");
  return getPlan(sub.planKey);
}
