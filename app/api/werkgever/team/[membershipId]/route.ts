import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/werkgever/team/:membershipId — remove a team member. Refuses
// to remove the organization's last HQ_ADMIN, so a tenant can never lock
// itself out of managing its own team/locations/billing.
export async function DELETE(
  _request: Request,
  props: { params: Promise<{ membershipId: string }> },
): Promise<NextResponse> {
  try {
    const { membershipId } = await props.params;
    const principal = await requirePrincipal();
    requireRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    const membership = await prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
      select: { id: true, role: true, user: { select: { email: true } } },
    });
    if (!membership) throw AppError.notFound("Teamlid niet gevonden");

    if (membership.role === "HQ_ADMIN") {
      const otherAdmins = await prisma.membership.count({
        where: { tenantId, role: "HQ_ADMIN", id: { not: membershipId } },
      });
      if (otherAdmins === 0) {
        throw AppError.conflict("Je kunt de laatste beheerder (HQ_ADMIN) van je organisatie niet verwijderen.");
      }
    }

    await prisma.membership.delete({ where: { id: membershipId } });

    await recordAudit({
      category: "COMPANY",
      action: "employer.team.removed",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} verwijderde ${membership.user.email} (${membership.role}) uit het team`,
      targetType: "membership",
      targetId: membershipId,
      metadata: { tenantId, role: membership.role },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
