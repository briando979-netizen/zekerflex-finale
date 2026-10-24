import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { getGlobalRules, setGlobalRules, type IssuingRules } from "@/lib/issuing/settings";
import { listAuthorizations } from "@/lib/issuing/log";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/issuing/rules — globale kaartregels + recent autorisatielogboek.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [rules, log] = await Promise.all([getGlobalRules(), listAuthorizations(50)]);
  return NextResponse.json({ rules, log });
});

const schema = z.object({
  perTxLimitCents: z.number().int().min(0).optional(),
  dailyBudgetCents: z.number().int().min(0).optional(),
  weeklyBudgetCents: z.number().int().min(0).optional(),
  blockedMccs: z.array(z.string().trim().max(8)).max(200).optional(),
  allowedCountries: z.array(z.string().trim().length(2)).max(250).optional(),
  aiCheck: z.boolean().optional(),
});

export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const input = schema.parse(
    await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }),
  );
  const patch: Partial<IssuingRules> = {};
  if (input.perTxLimitCents !== undefined) patch.perTxLimitCents = input.perTxLimitCents;
  if (input.dailyBudgetCents !== undefined) patch.dailyBudgetCents = input.dailyBudgetCents;
  if (input.weeklyBudgetCents !== undefined) patch.weeklyBudgetCents = input.weeklyBudgetCents;
  if (input.blockedMccs !== undefined) patch.blockedMccs = input.blockedMccs;
  if (input.allowedCountries !== undefined) patch.allowedCountries = input.allowedCountries.map((c) => c.toUpperCase());
  if (input.aiCheck !== undefined) patch.aiCheck = input.aiCheck;

  const rules = await setGlobalRules(patch);
  await recordAudit({
    category: "ADMIN",
    action: "issuing.rules",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: "Issuing-kaartregels bijgewerkt",
  });
  return NextResponse.json({ rules });
});
