import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { runMatchingForShift } from "@/lib/matching-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ shiftId: z.string().min(1).max(128) });

/**
 * POST /api/shifts/:shiftId/match
 * Kick off (or advance) matching for a shift. Idempotent per wave.
 */
export async function POST(
  _request: Request,
  { params }: { params: { shiftId: string } },
): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/shifts/[shiftId]/match" });
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");

    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_FAILED", message: "Invalid shift id" } },
        { status: 422 },
      );
    }

    const result = await runMatchingForShift(parsed.data.shiftId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("matching failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
