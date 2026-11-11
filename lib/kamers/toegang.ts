import { hasRole, requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { AppError } from "@/lib/errors";

/**
 * De organisatie van wie ingelogd is, voor het beheer van kamers en boekingen. Alleen de beheerder van de organisatie
 * (of een platformbeheerder): gastgegevens zijn gegevens van derden. Een lid zonder beheerdersrol krijgt 423 met een
 * eigen code, geen 403: een gewone sessie raakt dit vaak en CrowdSec telt een reeks 403's als inbraakpoging.
 */
export async function eigenOrganisatie(): Promise<{ tenantId: string; userId: string }> {
  const principal = await requirePrincipal();
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) throw AppError.alleenBeheerder("Alleen de beheerder van de organisatie beheert de kamers en boekingen.");
  const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
  if (!tenantId) throw AppError.notFound("Geen organisatie gevonden voor je account.");
  return { tenantId, userId: principal.userId };
}
