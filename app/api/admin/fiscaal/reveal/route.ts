import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { getFiscal } from "@/lib/fiscal/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ userId: z.string().min(1).max(64) });

// POST /api/admin/fiscaal/reveal — open one worker's masked fiscal record.
// Platform-admin only. Every reveal is written to the auditspoor.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const { userId } = schema.parse(await request.json().catch(() => ({})));
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, fullName: true } });
    if (!user) throw AppError.notFound("Gebruiker niet gevonden");

    const fiscal = await getFiscal(userId);

    await recordAudit({
      category: "KYC",
      action: "admin.fiscal.revealed",
      severity: "warning",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} bekeek fiscale gegevens van ${user.fullName}`,
      targetType: "user",
      targetId: userId,
    });

    return NextResponse.json({
      vatNumber: fiscal.vatNumber,
      kvkNumber: fiscal.kvkNumber,
      vatValid: fiscal.vatValid,
      vatStatus: fiscal.vatStatus,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
