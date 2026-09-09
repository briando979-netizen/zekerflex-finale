import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { confirmAdminConsole } from "@/lib/admin-console";
import { withAdminAccess } from "@/lib/auth/handlers";

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

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const log = logger.forRequest(request, { route: "POST /api/admin/console/confirm" });
  const json = await request.json().catch(() => {
    throw AppError.validation("Request body must be valid JSON");
  });
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    throw AppError.validation("Invalid request body", parsed.error.flatten());
  }

  try {
    const result = await confirmAdminConsole({
      confirmToken: parsed.data.confirmToken,
      principal,
    });
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status < 500) log.warn("confirm rejected", { status, code: body.error.code });
    throw err;
  }
});
