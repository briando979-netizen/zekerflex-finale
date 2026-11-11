import { hasRole, requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { AppError } from "@/lib/errors";
import { ALLEEN_BEHEERDER_TEKST } from "@/lib/afspraken/teksten";

/**
 * De organisatie van wie ingelogd is, voor het beheer van afspraken en klanten. Alleen de beheerder van de organisatie
 * (of een platformbeheerder): het zijn gegevens van de klanten van het bedrijf. Een teamlid zonder die rol krijgt 423 met
 * een eigen code (geen 403: de schermen laden bij elk bezoek en CrowdSec telt een reeks 403's als inbraakpoging).
 */
export async function eigenOrganisatie(): Promise<{ tenantId: string; userId: string }> {
  const principal = await requirePrincipal();
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) throw AppError.alleenBeheerder(ALLEEN_BEHEERDER_TEKST);
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
