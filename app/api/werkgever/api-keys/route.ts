import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { resolveTenantPlan } from "@/lib/api-plans/resolve";
import { AVAILABLE_SCOPES, createApiKey, listApiKeys } from "@/lib/integrations/api-keys";
import { recordAudit } from "@/lib/audit";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scopeKeys = AVAILABLE_SCOPES.map((s) => s.key);
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  scopes: z.array(z.enum(scopeKeys as [string, ...string[]])).min(1),
});

// GET /api/werkgever/api-keys — the calling employer's own keys (never another tenant's).
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    const all = await listApiKeys();
    const keys = all.filter((k) => k.tenant?.id === tenantId);
    return NextResponse.json({ keys });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/werkgever/api-keys — self-service key creation, scoped to the
// caller's own tenant and capped to what their current plan allows (an admin
// key can carry any scope; a self-service one can't exceed the plan).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");

    await enforceRateLimit({
      name: "werkgever-api-key-create",
      identifier: tenantId,
      limit: 10,
      windowSeconds: 3600,
      message: "Te veel sleutels aangemaakt — probeer het later opnieuw.",
    });

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());

    const plan = await resolveTenantPlan(tenantId);
    const disallowed = parsed.data.scopes.filter((s) => !(plan.scopes as string[]).includes(s));
    if (disallowed.length > 0) {
      throw AppError.forbidden(
        `Je ${plan.label}-abonnement biedt geen toegang tot: ${disallowed.join(", ")}. Upgrade via /werkgever/integraties.`,
      );
    }

    const { id, prefix, raw } = await createApiKey({
      name: parsed.data.name,
      tenantId,
      scopes: parsed.data.scopes,
      createdById: principal.userId,
    });

    await recordAudit({
      category: "COMPANY",
      action: "employer.apikey.created",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} maakte zelf API-sleutel "${parsed.data.name}" (${prefix}…) aan`,
      targetType: "apiKey",
      targetId: id,
      metadata: { scopes: parsed.data.scopes, tenantId, planKey: plan.key },
    });

    return NextResponse.json({ id, prefix, raw }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
