import type { Principal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";

/**
 * Wie een factuur mag inzien (PDF, UBL, e-factuurstand): de freelancer die hem
 * uitgaf of erop betaalt, een beheerder van het ontvangende bedrijf, of een
 * platformbeheerder. Gedeeld door /api/invoices/[id]/{pdf,ubl,efactuur}.
 */
export async function mayAccessInvoice(p: Principal, invoiceId: string): Promise<boolean> {
  const inv = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { recipientTenantId: true, recipientFreelancerId: true, issuerFreelancerId: true },
  });
  if (!inv) return false;

  for (const freelancerProfileId of [inv.issuerFreelancerId, inv.recipientFreelancerId]) {
    if (!freelancerProfileId) continue;
    const fp = await prisma.freelancerProfile.findFirst({
      where: { id: freelancerProfileId, userId: p.userId },
      select: { id: true },
    });
    if (fp) return true;
  }
  if (inv.recipientTenantId) {
    const scope = await resolveEmployerScope(p).catch(() => null);
    if (scope?.tenantIds.includes(inv.recipientTenantId)) return true;
  }
  return p.grants.some((g) => g.role === "PLATFORM_ADMIN");
}

/** Alleen een beheerder van het ontvangende bedrijf of een platformbeheerder mag een e-factuur (opnieuw) versturen. */
export async function mayManageInvoiceDelivery(p: Principal, invoiceId: string): Promise<boolean> {
  if (p.grants.some((g) => g.role === "PLATFORM_ADMIN")) return true;
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { recipientTenantId: true } });
  if (!inv?.recipientTenantId) return false;
  const scope = await resolveEmployerScope(p).catch(() => null);
  return Boolean(scope?.tenantIds.includes(inv.recipientTenantId)) && p.grants.some((g) => g.role === "HQ_ADMIN" || g.role === "LOCAL_MANAGER");
}
