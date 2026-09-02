import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { blankAgreementPdf } from "@/lib/pdf/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/gebruikers/<id>/overeenkomst — a ready-to-send blank
// modelovereenkomst PDF for this person.
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<Response> {
  const principal = await requirePrincipal();
  requireRole(principal, "PLATFORM_ADMIN");

  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { fullName: true } });
  if (!user) return new Response("Not found", { status: 404 });

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

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
