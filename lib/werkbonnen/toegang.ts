import { NextResponse } from "next/server";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { AppError, toErrorBody } from "@/lib/errors";

/** Een lid zonder beheerdersrol: 423 met een eigen code, geen 403 (CrowdSec telt een reeks 403's als inbraakpoging). */
export class WerkbonToegangFout extends Error {
  readonly status = 423;
  readonly code = "WERKBONNEN_ALLEEN_BEHEERDER";
  constructor() {
    super("Alleen de beheerder van de organisatie beheert de werkbonnen: ze bevatten gegevens van klanten.");
    this.name = "WerkbonToegangFout";
  }
}

/** De organisatie van wie ingelogd is, voor het beheer van werkbonnen. Alleen de beheerder (of een platformbeheerder). */
export async function eigenOrganisatie(): Promise<{ tenantId: string; userId: string }> {
  const principal = await requirePrincipal();
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) throw new WerkbonToegangFout();
  const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
  if (!tenantId) throw AppError.notFound("Geen organisatie gevonden voor je account.");
  return { tenantId, userId: principal.userId };
}

/** Het antwoord bij een fout: 423 voor een lid zonder beheerdersrol, anders de gewone foutvorm. */
export function foutAntwoord(err: unknown): NextResponse {
  if (err instanceof WerkbonToegangFout) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 423 });
  }
  const { status, body } = toErrorBody(err);
  return NextResponse.json(body, { status });
}
