import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { getRun } from "@/lib/payroll/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/payroll/2026-W35 — full run with every payslip.
export async function GET(
  _request: Request,
  { params }: { params: { isoWeek: string } },
): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN", "HQ_ADMIN");
    const run = await getRun(params.isoWeek);
    if (!run) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Run niet gevonden" } }, { status: 404 });
    return NextResponse.json({ run });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
