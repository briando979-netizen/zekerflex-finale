import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { importLeadsFromCsv } from "@/lib/sales/discovery/csv";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  campaignId: z.string().min(1).max(128).nullable().optional(),
  csv: z.string().min(10).max(2_000_000),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const json = await request.json().catch(() => {
    throw AppError.validation("Body must be JSON");
  });
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw AppError.validation("Ongeldige import", parsed.error.flatten());

  const result = await importLeadsFromCsv(
    parsed.data.campaignId ?? null,
    parsed.data.csv,
    principal.userId,
  );
  await recordAudit({
    category: "SALES",
    action: "sales.leads.imported",
    actorUserId: principal.userId,
    summary: `CSV-import: ${result.created} leads aangemaakt, ${result.skipped} overgeslagen`,
    metadata: { ...result, errors: result.errors.length },
  });
  return NextResponse.json({ result });
});
