import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { startTurn } from "@/lib/jarvis/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
  uploadIds: z.array(z.string().min(1).max(128)).max(10).optional(),
});

// POST /api/admin/jarvis/turn - start a Jarvis turn; returns the turn id.
// Progress is polled from GET /api/admin/jarvis/turns/:id.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");
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
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
