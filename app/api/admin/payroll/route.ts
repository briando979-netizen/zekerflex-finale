import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { buildWeeklyRun, finaliseRun } from "@/lib/payroll/engine";
import { listRuns } from "@/lib/payroll/store";
import { isoWeekId, isoWeekLabel, lastCompletedIsoWeek } from "@/lib/payroll/week";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET  /api/admin/payroll        — run history + the week that's ready to run
// POST /api/admin/payroll        — { isoWeek, action: "build" | "finalise" }
// Reads timesheets read-only; writes only to PayrollRunRecord/PayslipRecord.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const suggested = lastCompletedIsoWeek();
  return NextResponse.json({
    runs: await listRuns(),
    suggestedWeek: { id: isoWeekId(suggested), label: isoWeekLabel(suggested) },
  });
});

const bodySchema = z.object({
  isoWeek: z.string().regex(/^\d{4}-W\d{2}$/, "Verwacht formaat 2026-W35"),
  action: z.enum(["build", "finalise"]).default("build"),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const { isoWeek, action } = bodySchema.parse(
    await request.json().catch(() => {
      throw AppError.validation("Body must be JSON");
    }),
  );

  if (action === "finalise") {
    const run = await finaliseRun(isoWeek, principal.userId);
    return NextResponse.json({ run });
  }
  const { run, rebuilt } = await buildWeeklyRun(isoWeek, principal.userId);
  return NextResponse.json({ run, rebuilt });
});
