import { NextResponse } from "next/server";
import { getRun } from "@/lib/payroll/store";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/payroll/2026-W35 — full run with every payslip.
export const GET = withAdminAccess<{ isoWeek: string }>(["PLATFORM_ADMIN"], async (_request, { params }) => {
  const run = await getRun(params.isoWeek);
  if (!run) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Run niet gevonden" } }, { status: 404 });
  return NextResponse.json({ run });
});
