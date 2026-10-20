import { NextResponse } from "next/server";
import { z } from "zod";
import { KycStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  decision: z.enum(["approve", "reject", "reset"]),
  reason: z.string().trim().max(300).optional(),
});

const NEXT: Record<"approve" | "reject" | "reset", KycStatus> = {
  approve: KycStatus.VERIFIED,
  reject: KycStatus.REJECTED,
  reset: KycStatus.NOT_STARTED,
};

// POST /api/admin/gebruikers/<id>/kyc — set a user's identity status by hand,
// also when they never started a check (e.g. the Google Play review account,
// or someone verified in person). Leaves a MANUAL IdentityVerification row so
// the "Identiteitscontroles" history shows who decided what.
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { decision, reason } = schema.parse(await request.json().catch(() => ({})));
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, email: true, kycStatus: true } });
  if (!user) throw AppError.notFound("Gebruiker niet gevonden");

  const status = NEXT[decision];
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { kycStatus: status } });
    if (decision !== "reset") {
      await tx.identityVerification.create({
        data: {
          userId: user.id,
          provider: "ADMIN_MANUAL",
          status,
          decisionStatus: `Handmatig door ${principal.email}${reason ? `: ${reason}` : ""}`.slice(0, 300),
          ...(decision === "approve" ? { verifiedAt: new Date() } : {}),
        },
      });
    }
  });

  await recordAudit({
    category: "KYC",
    action: `kyc.admin_manual_${decision}`,
    severity: decision === "approve" ? "warning" : "info",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} zette de identiteit van ${user.email} handmatig op ${status} (was ${user.kycStatus})${reason ? ` — ${reason}` : ""}`,
    targetType: "user",
    targetId: user.id,
    metadata: { from: user.kycStatus, to: status },
  });

  return NextResponse.json({ ok: true, status });
});
