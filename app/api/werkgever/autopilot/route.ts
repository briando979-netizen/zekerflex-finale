import { NextResponse } from "next/server";
import { z } from "zod";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { getTenantAutopilot, setTenantAutopilot } from "@/lib/autopilot/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function tenantFor() {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
  return { principal, tenantId };
}

// GET /api/werkgever/autopilot — this organisation's autopilot opt-ins.
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await tenantFor();
    return NextResponse.json(await getTenantAutopilot(tenantId));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({ autoApproveHours: z.boolean() });

// POST /api/werkgever/autopilot — switch automatic hour approval on/off.
// Only someone who may approve hours can switch it on; approvals then run with THEIR rights.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { principal, tenantId } = await tenantFor();
    if (!hasRole(principal, "HQ_ADMIN", "LOCAL_MANAGER")) throw AppError.forbidden("Alleen beheerders die uren mogen goedkeuren kunnen dit aanzetten.");
    const { autoApproveHours } = schema.parse(await request.json().catch(() => ({})));
    const next = autoApproveHours
      ? { autoApproveHours: true, byUserId: principal.userId, since: new Date().toISOString() }
      : { autoApproveHours: false, byUserId: null, since: null };
    await setTenantAutopilot(tenantId, next);
    await recordAudit({
      category: "TIMESHEET",
      action: autoApproveHours ? "autopilot.auto_approve.on" : "autopilot.auto_approve.off",
      severity: "warning",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} zette automatisch uren goedkeuren ${autoApproveHours ? "AAN" : "uit"} voor organisatie ${tenantId}`,
      targetType: "tenant",
      targetId: tenantId,
    }).catch(() => undefined);
    return NextResponse.json(next);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
