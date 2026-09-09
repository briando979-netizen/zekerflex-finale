import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { revokeApiKey } from "@/lib/integrations/api-keys";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/api-keys/<id>/revoke — kills a key immediately and permanently.
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params, principal }) => {
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
});
