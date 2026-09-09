import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { getFiscal } from "@/lib/fiscal/store";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ userId: z.string().min(1).max(64) });

// POST /api/admin/fiscaal/reveal — open one worker's masked fiscal record.
// Platform-admin only. Every reveal is written to the auditspoor.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
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
});
