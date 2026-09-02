import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { runAdminConsole } from "@/lib/admin-console";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/admin/console
//
// Natural-language admin console (PLATFORM_ADMIN). A Dutch question is mapped
// by the self-hosted LLM to one read-only query (-> answer + summary) or one
// mutation intent (-> impact analysis + confirm token; NOTHING is changed).
// ---------------------------------------------------------------------------

const bodySchema = z.object({
  question: z.string().trim().min(3).max(500),
});

export async function POST(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "POST /api/admin/console" });
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

    const result = await runAdminConsole({
      question: parsed.data.question,
      principal,
    });
    return NextResponse.json(result);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("console failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
