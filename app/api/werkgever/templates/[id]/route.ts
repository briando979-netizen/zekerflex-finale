import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/audit";
import { getTemplate, updateTemplate, deleteTemplate } from "@/lib/shifts/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  label: z.string().trim().min(2).max(80).optional(),
  hourlyRateCents: z.coerce.number().int().min(env.MIN_SHIFT_RATE_CENTS).max(20000).optional(),
  breakMinutes: z.coerce.number().int().min(0).max(240).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  dresscode: z.string().trim().max(500).nullable().optional(),
  defaultBranchId: z.string().min(1).max(128).nullable().optional(),
});

// PATCH /api/werkgever/templates/:id
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await props.params;
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    const existing = await getTemplate(tenantId, id);
    if (!existing) throw AppError.notFound("Template niet gevonden");

    const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());
    const d = parsed.data;

    const template = await updateTemplate(tenantId, id, {
      ...(d.label !== undefined ? { label: d.label } : {}),
      ...(d.hourlyRateCents !== undefined ? { hourlyRateCents: d.hourlyRateCents } : {}),
      ...(d.breakMinutes !== undefined ? { breakMinutes: d.breakMinutes } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.dresscode !== undefined ? { dresscode: d.dresscode } : {}),
      ...(d.defaultBranchId !== undefined ? { defaultBranchId: d.defaultBranchId } : {}),
    });

    await recordAudit({
      category: "COMPANY",
      action: "employer.template.updated",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} bewerkte klus-template "${template!.label}"`,
      targetType: "shiftTemplate",
      targetId: id,
      metadata: { tenantId, fields: Object.keys(parsed.data) },
    });

    return NextResponse.json({ template });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/werkgever/templates/:id
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await props.params;
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    const existing = await getTemplate(tenantId, id);
    if (!existing) throw AppError.notFound("Template niet gevonden");

    await deleteTemplate(tenantId, id);

    await recordAudit({
      category: "COMPANY",
      action: "employer.template.deleted",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} verwijderde klus-template "${existing.label}"`,
      targetType: "shiftTemplate",
      targetId: id,
      metadata: { tenantId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
