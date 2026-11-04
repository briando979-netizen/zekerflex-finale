import { NextResponse } from "next/server";
import { z } from "zod";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { WERKRUIMTES, WERKRUIMTE_INFO } from "@/lib/werkgever/werkruimte";
import { bewaarWerkruimte } from "@/lib/werkgever/werkruimte-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ soort: z.enum(WERKRUIMTES), ookPersoneel: z.boolean() });

// POST /api/werkgever/werkruimte — wat voor bedrijf: richt menu en startscherm van /werkgever daarop in.
// Alleen de beheerder van het bedrijf kiest; het geldt voor iedereen in het bedrijf.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    if (!hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) throw AppError.forbidden("Alleen de beheerder van het bedrijf kan de werkruimte kiezen.");
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
    const { soort, ookPersoneel } = schema.parse(await request.json().catch(() => ({})));
    const keuze = await bewaarWerkruimte(tenantId, soort, ookPersoneel);
    await recordAudit({
      category: "COMPANY",
      action: "werkruimte.kies",
      severity: "info",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} richtte de werkruimte in als ${WERKRUIMTE_INFO[soort].naam}${ookPersoneel ? " (ook personeel inhuren)" : ""}`,
      targetType: "tenant",
      targetId: tenantId,
    }).catch(() => undefined);
    return NextResponse.json(keuze);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
