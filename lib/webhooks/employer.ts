import { hasRole, requirePrincipal } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";

/** The calling employer's organisation; mutations need the HQ admin. */
export async function employerTenant(requireAdmin: boolean) {
  const principal = await requirePrincipal();
  const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
  if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
  if (requireAdmin && !hasRole(principal, "HQ_ADMIN")) throw AppError.forbidden("Alleen de hoofdbeheerder beheert webhooks");
  return { principal, tenantId };
}
