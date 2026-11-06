import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { runAdminConsole } from "@/lib/admin-console";
import { withAdminAccess } from "@/lib/auth/handlers";

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

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Het verzoek kwam niet goed aan. Vernieuw de pagina en probeer het opnieuw.");
  });
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    throw AppError.validation("Niet alle gegevens zijn goed ingevuld.", parsed.error.flatten());
  }

  const result = await runAdminConsole({
    question: parsed.data.question,
    principal,
  });
  return NextResponse.json(result);
});
