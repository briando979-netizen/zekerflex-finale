import { NextResponse } from "next/server";
import { z } from "zod";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getIncheckInstelling, zetIncheckenVereist } from "@/lib/checkin/vereist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tenantFor() {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
  return { principal, tenantId };
}

// GET /api/werkgever/incheck-instelling — moeten de werkers van dit bedrijf inchecken? (lib/checkin/vereist.ts)
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await tenantFor();
    return NextResponse.json(await getIncheckInstelling(tenantId));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({ vereist: z.boolean() });

// POST /api/werkgever/incheck-instelling — inchecken aan of uit voor het hele bedrijf. Alleen wie uren mag goedkeuren: bij
// uit is de goedkeuring van het bedrijf het bewijs van aanwezigheid. Het antwoord is de nieuwe stand.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { principal, tenantId } = await tenantFor();
    if (!hasRole(principal, "HQ_ADMIN", "LOCAL_MANAGER")) throw AppError.forbidden("Alleen beheerders die uren mogen goedkeuren kunnen dit instellen.");
    const { vereist } = schema.parse(await request.json().catch(() => ({})));
    const volgende = await zetIncheckenVereist(tenantId, vereist);
    await recordAudit({
      category: "TIMESHEET",
      action: vereist ? "checkin.vereist.aan" : "checkin.vereist.uit",
      severity: "warning",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} zette inchecken ${vereist ? "AAN" : "UIT"} voor organisatie ${tenantId}`,
      targetType: "tenant",
      targetId: tenantId,
    }).catch(() => undefined);
    return NextResponse.json(volgende);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
