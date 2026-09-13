import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { exportUserData, exportFilename } from "@/lib/privacy/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/gebruikers/<id>/export — AVG art. 15 export produced by an
// admin on the data subject's behalf (e.g. an e-mailed access request).
export const GET = withAdminAccess<{ id: string }>(
  ["PLATFORM_ADMIN"],
  async (_request, { params, principal }) => {
    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!user) throw AppError.notFound("Gebruiker niet gevonden");

    const data = await exportUserData(params.id);

    await recordAudit({
      category: "SECURITY",
      action: "privacy.data.exported",
      severity: "warning",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Gegevensexport (AVG art. 15) van account ${params.id} gemaakt door ${principal.email}`,
      targetType: "user",
      targetId: params.id,
    });

    return new Response(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${exportFilename(params.id)}"`,
        "cache-control": "no-store",
      },
    });
  },
);
