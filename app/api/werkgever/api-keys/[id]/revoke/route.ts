import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { recordAudit } from "@/lib/audit";
import { revokeApiKey } from "@/lib/integrations/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/werkgever/api-keys/<id>/revoke — an employer may only revoke their own tenant's key.
export async function POST(_request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);

    const key = await prisma.apiKey.findUnique({ where: { id: params.id }, select: { name: true, tenantId: true } });
    if (!key) throw AppError.notFound("Sleutel niet gevonden");
    if (!key.tenantId || !scope.tenantIds.includes(key.tenantId)) {
      throw AppError.forbidden("Deze sleutel hoort niet bij jouw organisatie");
    }

    await revokeApiKey(params.id);

    await recordAudit({
      category: "COMPANY",
      action: "employer.apikey.revoked",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} trok zelf API-sleutel "${key.name}" in`,
      targetType: "apiKey",
      targetId: params.id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
