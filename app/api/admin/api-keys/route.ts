import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { AVAILABLE_SCOPES, createApiKey, listApiKeys } from "@/lib/integrations/api-keys";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scopeKeys = AVAILABLE_SCOPES.map((s) => s.key);
const schema = z.object({
  name: z.string().trim().min(2).max(120),
  tenantId: z.string().trim().max(64).optional(),
  scopes: z.array(z.enum(scopeKeys as [string, ...string[]])).min(1),
});

// GET /api/admin/api-keys — list every key (secrets never included).
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const keys = await listApiKeys();
  return NextResponse.json({ keys, scopes: AVAILABLE_SCOPES });
});

// POST /api/admin/api-keys — issue a new key. The raw secret is returned ONCE.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
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
});
