import { hasRole, requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { AppError } from "@/lib/errors";

/**
 * De organisatie van wie ingelogd is, voor het beheer van offertes. Alleen de beheerder van de organisatie (of een
 * platformbeheerder): een offerte bevat gegevens van klanten. Een lid zonder beheerdersrol krijgt 423 met een eigen code
 * en geen 403: een scherm dat een gewone sessie vaak raakt mag CrowdSec niet laten denken aan een inbraakpoging.
 */
export async function eigenOrganisatie(): Promise<{ tenantId: string; userId: string }> {
  const principal = await requirePrincipal();
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) {
    throw AppError.alleenBeheerder("Alleen de beheerder van de organisatie beheert de offertes.");
  }
  const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
  if (!tenantId) throw AppError.notFound("Geen organisatie gevonden voor je account.");
  return { tenantId, userId: principal.userId };
}

/** Een JSON-body lezen; een kapotte body geeft een gewone Nederlandse fout. */
export async function leesJson(request: Request): Promise<Record<string, unknown>> {
  const json: unknown = await request.json().catch(() => {
    throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
  });
  return json && typeof json === "object" ? (json as Record<string, unknown>) : {};
}
