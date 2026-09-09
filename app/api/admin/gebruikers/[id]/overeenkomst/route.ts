import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { blankAgreementPdf } from "@/lib/pdf/documents";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/gebruikers/<id>/overeenkomst — a ready-to-send blank
// modelovereenkomst PDF for this person.
export const GET = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params, principal }) => {
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { fullName: true } });
  if (!user) return new NextResponse("Not found", { status: 404 });

  const { bytes, filename } = blankAgreementPdf(user.fullName);

  await recordAudit({
    category: "AGREEMENT",
    action: "admin.user.agreement_generated",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} genereerde een blanco modelovereenkomst voor ${user.fullName}`,
    targetType: "user",
    targetId: params.id,
  }).catch(() => undefined);

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
