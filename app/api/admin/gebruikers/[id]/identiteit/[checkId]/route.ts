import { NextResponse } from "next/server";
import { z } from "zod";
import { ComplianceDocKind, ComplianceDocStatus, KycStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ decision: z.enum(["approve", "reject"]) });

// POST /api/admin/gebruikers/<id>/identiteit/<checkId> — resolve a PENDING
// self-serve identity check by hand. lib/onboarding/verify.ts leaves a check
// "in_review" whenever the automatic AI review can't run (e.g. no LLM
// reachable, which is always true on this Vercel deployment) — until now
// there was no way for such a check to ever leave that state.
export const POST = withAdminAccess<{ id: string; checkId: string }>(
  ["PLATFORM_ADMIN"],
  async (request, { params, principal }) => {
    const { decision } = schema.parse(await request.json().catch(() => ({})));
    const check = await prisma.identityVerification.findFirst({
      where: { id: params.checkId, userId: params.id },
      select: { id: true, userId: true, documentType: true },
    });
    if (!check) throw AppError.notFound("Controle niet gevonden");

    const newStatus = decision === "approve" ? KycStatus.VERIFIED : KycStatus.REJECTED;

    await prisma.$transaction(async (tx) => {
      await tx.identityVerification.update({
        where: { id: check.id },
        data: { status: newStatus, verifiedAt: decision === "approve" ? new Date() : null },
      });
      await tx.user.update({ where: { id: check.userId }, data: { kycStatus: newStatus } });
      // Same document the self-serve flow auto-fills from the front photo —
      // keep it in sync so ComplianceDocsPanel doesn't keep showing
      // "uploaded" once an admin has actually approved the identity check.
      if (check.documentType !== "DRIVERS_LICENSE") {
        await tx.complianceDocument.updateMany({
          where: { userId: check.userId, kind: ComplianceDocKind.ID, status: ComplianceDocStatus.UPLOADED },
          data: { status: decision === "approve" ? ComplianceDocStatus.APPROVED : ComplianceDocStatus.REJECTED },
        });
      }
    });

    await recordAudit({
      category: "KYC",
      action: decision === "approve" ? "kyc.admin_approved" : "kyc.admin_rejected",
      severity: "info",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} heeft een identiteitscontrole ${decision === "approve" ? "goedgekeurd" : "afgewezen"}`,
      targetType: "user",
      targetId: check.userId,
    });

    return NextResponse.json({ ok: true, status: newStatus });
  },
);
