import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ blocked: z.boolean() });

// POST /api/admin/bedrijven/<id>/blokkeer — the Tenant model has no status
// flag of its own, so "blocking a company" blocks every user with a
// membership on it (real effect: none of them can log in while blocked).
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { blocked } = schema.parse(await request.json().catch(() => ({})));
  const tenant = await prisma.tenant.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, memberships: { select: { userId: true } } },
  });
  if (!tenant) throw AppError.notFound("Organisatie niet gevonden");

  const userIds = tenant.memberships.map((m) => m.userId);
  if (userIds.length) {
    await prisma.user.updateMany({
      where: { id: { in: userIds } },
      data: { disabledAt: blocked ? new Date() : null },
    });
  }

  await recordAudit({
    category: "COMPANY",
    action: blocked ? "admin.company.blocked" : "admin.company.unblocked",
    severity: blocked ? "warning" : "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} heeft ${tenant.name} ${blocked ? "geblokkeerd" : "gedeblokkeerd"} (${userIds.length} gebruiker${userIds.length === 1 ? "" : "s"})`,
    targetType: "tenant",
    targetId: params.id,
  });

  return NextResponse.json({ ok: true, blocked, affected: userIds.length });
});
