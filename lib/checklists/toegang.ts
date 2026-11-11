import { NextResponse } from "next/server";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { AppError, toErrorBody } from "@/lib/errors";
import type { Sjabloon } from "@/lib/checklists/model";

/** De organisatie van wie ingelogd is, voor het beheer van checklists. Alleen de beheerder (of een platformbeheerder); een ander lid krijgt 423. */
export async function eigenOrganisatie(): Promise<{ tenantId: string; userId: string }> {
  const principal = await requirePrincipal();
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) throw AppError.alleenBeheerder("Alleen de beheerder van de organisatie beheert de checklists. Vraag de beheerder om het voor je te doen.");
  const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
  if (!tenantId) throw AppError.notFound("Geen organisatie gevonden voor je account.");
  return { tenantId, userId: principal.userId };
}

/** Een fout als antwoord: een Nederlandse tekst met de juiste statuscode. */
export function foutAntwoord(err: unknown): NextResponse {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
}

/** Een JSON-body lezen; een kapotte body geeft een gewone Nederlandse fout. */
export async function leesJson(request: Request): Promise<Record<string, unknown>> {
  const json: unknown = await request.json().catch(() => {
    throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
  });
  return json && typeof json === "object" ? (json as Record<string, unknown>) : {};
}

/** Een sjabloon voor het scherm van de beheerder: nooit de hash van de sleutel, alleen of er een link is. */
export function voorBeheer(s: Sjabloon): Omit<Sjabloon, "linkHash"> & { linkActief: boolean } {
  const rest: Record<string, unknown> = { ...s };
  delete rest.linkHash;
  return { ...(rest as Omit<Sjabloon, "linkHash">), linkActief: s.linkHash !== null };
}
