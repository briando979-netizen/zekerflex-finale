import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { AVAILABLE_SCOPES, createApiKey, listApiKeys } from "@/lib/integrations/api-keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scopeKeys = AVAILABLE_SCOPES.map((s) => s.key);
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  tenantId: z.string().trim().max(64).optional(),
  scopes: z.array(z.enum(scopeKeys as [string, ...string[]])).min(1),
});

// GET /api/admin/api-keys — list every key (secrets never included).
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
    const keys = await listApiKeys();
    return NextResponse.json({ keys, scopes: AVAILABLE_SCOPES });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/admin/api-keys — issue a new key. The raw secret is returned ONCE.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw AppError.validation("Controleer de ingevulde gegevens", parsed.error.flatten());

    const { id, prefix, raw } = await createApiKey({
      name: parsed.data.name,
      tenantId: parsed.data.tenantId || null,
      scopes: parsed.data.scopes,
      createdById: principal.userId,
    });

    await recordAudit({
      category: "ADMIN",
      action: "admin.apikey.created",
      severity: "warning",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `${principal.email} maakte API-sleutel "${parsed.data.name}" (${prefix}…)`,
      targetType: "apiKey",
      targetId: id,
      metadata: { scopes: parsed.data.scopes, tenantId: parsed.data.tenantId ?? null },
    });

    return NextResponse.json({ id, prefix, raw }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
