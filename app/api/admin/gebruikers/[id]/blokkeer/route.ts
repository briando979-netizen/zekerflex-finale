import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ blocked: z.boolean() });

// POST /api/admin/gebruikers/<id>/blokkeer — toggles the account's disabledAt.
// This is real: both the credentials login and Google auto-resolve filter on
// disabledAt: null, so a blocked account genuinely can't sign in anymore.
export async function POST(request: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

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
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
