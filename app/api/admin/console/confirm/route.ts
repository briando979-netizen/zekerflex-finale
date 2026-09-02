import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { confirmAdminConsole } from "@/lib/admin-console";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/admin/console/confirm
//
// Executes the mutation described by a confirm token minted by
// POST /api/admin/console. The token carries the action + validated params +
// operator id; execution is audited at severity "critical".
// ---------------------------------------------------------------------------

const bodySchema = z.object({
  confirmToken: z.string().min(20).max(4096),
});

export async function POST(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/admin/console/confirm" });
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const json = await request.json().catch(() => {
      throw AppError.validation("Request body must be valid JSON");
    });
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw AppError.validation("Invalid request body", parsed.error.flatten());
    }

    const result = await confirmAdminConsole({
      confirmToken: parsed.data.confirmToken,
      principal,
    });
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("confirm failed", { error: (err as Error).message });
    else log.warn("confirm rejected", { status, code: body.error.code });
    return NextResponse.json(body, { status });
  }
}
