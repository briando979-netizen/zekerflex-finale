import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { revokeApiKey } from "@/lib/integrations/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/api-keys/<id>/revoke — kills a key immediately and permanently.
export async function POST(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const key = await prisma.apiKey.findUnique({ where: { id: params.id }, select: { name: true } });
    if (!key) throw AppError.notFound("Sleutel niet gevonden");

    await revokeApiKey(params.id);

    await recordAudit({
      category: "ADMIN",
      action: "admin.apikey.revoked",
      severity: "warning",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} trok API-sleutel "${key.name}" in`,
      targetType: "apiKey",
      targetId: params.id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
