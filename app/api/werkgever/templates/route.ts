import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { env } from "@/lib/env";
import { recordAudit } from "@/lib/audit";
import { saveTemplate, listTemplates } from "@/lib/shifts/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/templates — the caller's own tenant's klus-templates.
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    return NextResponse.json({ templates: await listTemplates(tenantId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({
  label: z.string().trim().min(2).max(80),
  hourlyRateCents: z.coerce.number().int().min(env.MIN_SHIFT_RATE_CENTS).max(20000),
  breakMinutes: z.coerce.number().int().min(0).max(240).default(0),
  description: z.string().trim().max(1000).optional(),
  dresscode: z.string().trim().max(500).optional(),
  defaultBranchId: z.string().min(1).max(128).optional(),
});

// POST /api/werkgever/templates — any employer-side teamlid may save a
// template for the team to reuse (a gemaksfunctie, not an org-wide setting —
// unlike /werkgever/locaties and /werkgever/team this isn't HQ_ADMIN-gated).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());

    const template = await saveTemplate({
      tenantId,
      label: parsed.data.label,
      hourlyRateCents: parsed.data.hourlyRateCents,
      breakMinutes: parsed.data.breakMinutes,
      description: parsed.data.description ?? null,
      dresscode: parsed.data.dresscode ?? null,
      defaultBranchId: parsed.data.defaultBranchId ?? null,
      createdById: principal.userId,
    });

    await recordAudit({
      category: "COMPANY",
      action: "employer.template.created",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} maakte klus-template "${template.label}" aan`,
      targetType: "shiftTemplate",
      targetId: template.id,
      metadata: { tenantId },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
