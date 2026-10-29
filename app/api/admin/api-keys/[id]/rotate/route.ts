import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { rotateApiKey } from "@/lib/integrations/api-keys";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/api-keys/<id>/rotate — geeft een verse sleutel uit; de oude
// blijft nog een grace-periode (24u, revokedAt in de toekomst) werken zodat een
// integratie zonder downtime kan omschakelen. De nieuwe secret wordt ÉÉN keer teruggegeven.
export const POST = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (_req, { params, principal }) => {
  const old = await prisma.apiKey.findUnique({ where: { id: params.id }, select: { name: true, revokedAt: true } });
  if (!old) throw AppError.notFound("Sleutel niet gevonden");
  if (old.revokedAt && old.revokedAt <= new Date()) {
    throw AppError.validation("Een ingetrokken sleutel kan niet geroteerd worden.");
  }

  const { id, prefix, raw, oldValidUntil } = await rotateApiKey(params.id, principal.userId);

  await recordAudit({
    category: "ADMIN",
    action: "admin.apikey.rotated",
    severity: "warning",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `${principal.email} roteerde API-sleutel "${old.name}" (nieuw: ${prefix}…)`,
    targetType: "apiKey",
    targetId: id,
    metadata: { previousKeyId: params.id, oldValidUntil: oldValidUntil.toISOString() },
  });

  return NextResponse.json({ id, prefix, raw, oldValidUntil }, { status: 201 });
});
