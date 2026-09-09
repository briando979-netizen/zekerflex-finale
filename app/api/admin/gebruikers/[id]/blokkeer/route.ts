import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ blocked: z.boolean() });

// POST /api/admin/gebruikers/<id>/blokkeer — toggles the account's disabledAt.
// This is real: both the credentials login and Google auto-resolve filter on
// disabledAt: null, so a blocked account genuinely can't sign in anymore.
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { blocked } = schema.parse(await request.json().catch(() => ({})));
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, fullName: true } });
  if (!user) throw AppError.notFound("Gebruiker niet gevonden");

  await prisma.user.update({
    where: { id: params.id },
    data: { disabledAt: blocked ? new Date() : null },
  });

  await recordAudit({
    category: "SECURITY",
    action: blocked ? "admin.user.blocked" : "admin.user.unblocked",
    severity: blocked ? "warning" : "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} heeft ${user.fullName} ${blocked ? "geblokkeerd" : "gedeblokkeerd"}`,
    targetType: "user",
    targetId: params.id,
  });

  return NextResponse.json({ ok: true, blocked });
});
