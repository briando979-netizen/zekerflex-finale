import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { resolveFinding } from "@/lib/orchestration/core";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ id: z.string().min(1).max(128) });
const bodySchema = z.object({
  action: z.enum(["acknowledge", "dismiss", "actioned"]),
  note: z.string().trim().max(1000).optional(),
});

// PATCH /api/admin/orchestration/findings/:id
export const PATCH = withAdminAccess<{ id: string }>(["PLATFORM_ADMIN"], async (request, { params, principal }) => {
  const { id } = paramsSchema.parse(params);
  const json = await request.json().catch(() => {
    throw AppError.validation("Body must be JSON");
  });
  const { action, note } = bodySchema.parse(json);

  const updated = await resolveFinding(id, {
    action,
    resolvedById: principal.userId,
    ...(note !== undefined ? { note } : {}),
  });
  return NextResponse.json({ finding: updated });
});
