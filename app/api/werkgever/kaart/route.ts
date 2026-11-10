import { NextResponse } from "next/server";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { dienIn, leesAanmelding } from "@/lib/kaart/aanmelden-store";
import type { AanmeldInvoer } from "@/lib/kaart/aanmelden";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function eigenOrganisatie(): Promise<{ tenantId: string; userId: string }> {
  const principal = await requirePrincipal();
  if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) throw AppError.forbidden("Alleen de beheerder van de organisatie kan het bedrijf op de kaart zetten.");
  const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
  if (!tenantId) throw AppError.notFound("Geen organisatie gevonden voor je account.");
  return { tenantId, userId: principal.userId };
}

/** GET /api/werkgever/kaart: de aanmelding van je eigen organisatie, of null. */
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    return NextResponse.json({ aanmelding: await leesAanmelding(tenantId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/** PUT /api/werkgever/kaart: je bedrijf aanmelden of wijzigen. Het komt pas op de kaart na goedkeuring door ZekerFlex. */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "kaart-aanmelden", identifier: userId, limit: 20, windowSeconds: 3600, message: "Je hebt je gegevens vaak aangepast. Probeer het over een uur opnieuw." });
    const json: unknown = await request.json().catch(() => {
      throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
    });
    const a = await dienIn(tenantId, (json && typeof json === "object" ? json : {}) as AanmeldInvoer);
    await recordAudit({
      category: "COMPANY",
      action: "kaart.aangemeld",
      actorUserId: userId,
      actorLabel: "user",
      summary: `Bedrijf aangemeld voor ZekerFlex Kaart: ${a.naam}`,
      targetType: "tenant",
      targetId: tenantId,
    });
    return NextResponse.json({ aanmelding: a });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
