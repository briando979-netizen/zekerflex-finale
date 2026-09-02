import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { payslipsForUser } from "@/lib/payroll/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/payroll — the signed-in worker's own weekly payslips. Read-only,
// filesystem only.
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const payslips = await payslipsForUser(principal.userId);
    return NextResponse.json({ payslips });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
