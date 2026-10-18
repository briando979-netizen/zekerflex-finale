import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { recordAudit } from "@/lib/audit";
import { rotateApiKey } from "@/lib/integrations/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/werkgever/api-keys/<id>/rotate { graceHours } — new key, old one keeps working for the grace period.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const params = await props.params;
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const { graceHours } = z.object({ graceHours: z.number().int().min(0).max(168).default(24) }).parse(await request.json().catch(() => ({})));
    const key = await prisma.apiKey.findUnique({ where: { id: params.id }, select: { name: true, tenantId: true } });
    if (!key) throw AppError.notFound("Sleutel niet gevonden");
    if (!key.tenantId || !scope.tenantIds.includes(key.tenantId)) throw AppError.forbidden("Deze sleutel hoort niet bij jouw organisatie");
    let rotated;
    try {
      rotated = await rotateApiKey(params.id, principal.userId, graceHours);
    } catch (e) {
      throw AppError.precondition((e as Error).message);
    }
    await recordAudit({
      category: "COMPANY",
      action: "employer.apikey.rotated",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `API-sleutel "${key.name}" vernieuwd; oude geldig tot ${rotated.oldValidUntil.toISOString()}`,
      targetType: "apiKey",
      targetId: params.id,
    });
    return NextResponse.json({ prefix: rotated.prefix, raw: rotated.raw, oldValidUntil: rotated.oldValidUntil });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
