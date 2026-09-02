import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import {
  isKvkBaseEnabled,
  lookupCompany,
  searchCompanies,
} from "@/lib/integrations/kvkbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    kvk: z.string().regex(/^\d[\d\s.]{6,11}$/).optional(),
    q: z.string().trim().min(2).max(120).optional(),
    enrich: z
      .enum(["true", "false", "1", "0"])
      .optional()
      .transform((v) => v === "true" || v === "1"),
  })
  .refine((v) => v.kvk || v.q, { message: "Provide `kvk` or `q`" });

/**
 * GET /api/company/lookup?kvk=12345678[&enrich=true]  -> Handelsregister profile
 * GET /api/company/lookup?q=acme                      -> up to 15 search hits
 *
 * Used by the company-registration UI. Any authenticated user may look up.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "GET /api/company/lookup" });
  try {
    await requirePrincipal();

    if (!isKvkBaseEnabled()) {
      throw AppError.upstream("Company lookup is not configured");
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      kvk: searchParams.get("kvk") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      enrich: searchParams.get("enrich") ?? undefined,
    });
    if (!parsed.success) {
      throw AppError.validation("Invalid query", parsed.error.flatten());
    }

    if (parsed.data.kvk) {
      const profile = await lookupCompany(parsed.data.kvk, {
        enrich: parsed.data.enrich,
      });
      return NextResponse.json({ profile });
    }
    const results = await searchCompanies(parsed.data.q!);
    return NextResponse.json({ results });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("lookup failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
