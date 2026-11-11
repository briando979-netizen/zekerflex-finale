import { NextResponse } from "next/server";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { AppError, toErrorBody } from "@/lib/errors";

/** De tekst voor een lid zonder beheerdersrol (423 ALLEEN_BEHEERDER, geen 403: CrowdSec). */
export const ALLEEN_BEHEERDER_TEKST = "Alleen de beheerder van de organisatie beheert de werkbonnen: ze bevatten gegevens van klanten.";

/** De organisatie van wie ingelogd is, voor het beheer van werkbonnen. Alleen de beheerder (of een platformbeheerder). */
export async function eigenOrganisatie(): Promise<{ tenantId: string; userId: string }> {
  const principal = await requirePrincipal();
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) throw AppError.alleenBeheerder(ALLEEN_BEHEERDER_TEKST);
  const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
  if (!tenantId) throw AppError.notFound("Geen organisatie gevonden voor je account.");
  return { tenantId, userId: principal.userId };
}

/** Het antwoord bij een fout in de gewone foutvorm (een lid zonder beheerdersrol krijgt 423). */
export function foutAntwoord(err: unknown): NextResponse {
  const { status, body } = toErrorBody(err);
  return NextResponse.json(body, { status });
}
