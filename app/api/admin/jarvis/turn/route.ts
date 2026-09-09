import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { startTurn } from "@/lib/jarvis/core";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  uploadIds: z.array(z.string().min(1).max(128)).max(10).optional(),
});

// POST /api/admin/jarvis/turn - start a Jarvis turn; returns the turn id.
// Progress is polled from GET /api/admin/jarvis/turns/:id.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Body must be JSON");
  });
  const { prompt, uploadIds } = bodySchema.parse(json);

  const { turnId } = await startTurn({
    prompt,
    principal,
    ...(uploadIds ? { uploadIds } : {}),
  });
  return NextResponse.json({ turnId }, { status: 202 });
});
