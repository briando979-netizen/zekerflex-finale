import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { adminFlags, deleteFlag, setFlag } from "@/lib/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/flags — registry + stored overrides.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ flags: await adminFlags() });
});

const ROLES = ["FREELANCER", "LOCAL_MANAGER", "HQ_ADMIN", "DISPUTE_MANAGER", "SALES", "PLATFORM_ADMIN"] as const;
const schema = z.object({
  key: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, "alleen kleine letters, cijfers en koppeltekens"),
  enabled: z.boolean().optional(),
  rolloutPct: z.number().int().min(0).max(100).optional(),
  roles: z.array(z.enum(ROLES)).max(6).optional(),
  userIds: z.array(z.string().max(64)).max(200).optional(),
  note: z.string().max(200).optional(),
});

// POST /api/admin/flags — create or update a flag override.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { key, ...patch } = schema.parse(await request.json().catch(() => ({})));
  await setFlag(key, patch, principal.email);
  await recordAudit({
    category: "ADMIN",
    action: "feature-flag.set",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Feature flag "${key}" aangepast: ${JSON.stringify(patch)}`,
    targetType: "feature-flag",
    targetId: key,
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
});

// DELETE /api/admin/flags?key=... — remove an override (back to the code default).
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const key = new URL(request.url).searchParams.get("key");
  if (!key) return NextResponse.json({ error: { code: "VALIDATION", message: "key ontbreekt" } }, { status: 400 });
  await deleteFlag(key);
  await recordAudit({ category: "ADMIN", action: "feature-flag.delete", actorUserId: principal.userId, actorLabel: "user", summary: `Feature flag "${key}" teruggezet naar standaard`, targetType: "feature-flag", targetId: key }).catch(() => undefined);
  return NextResponse.json({ ok: true });
});
