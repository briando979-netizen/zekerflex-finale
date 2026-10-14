import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { recordAudit } from "@/lib/audit";
import { getTeamInvite, revokeTeamInvite } from "@/lib/team/invite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/werkgever/team/invites/:id — revoke a pending invite before it's
// accepted (the signed link stops working — accept.ts re-checks KV status).
export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await props.params;
    const principal = await requirePrincipal();
    requireRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    const invite = await getTeamInvite(tenantId, id);
    if (!invite) throw AppError.notFound("Uitnodiging niet gevonden");

    await revokeTeamInvite(tenantId, id);

    await recordAudit({
      category: "COMPANY",
      action: "employer.team.invite_revoked",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} trok de uitnodiging aan ${invite.email} in`,
      targetType: "teamInvite",
      targetId: id,
      metadata: { tenantId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
