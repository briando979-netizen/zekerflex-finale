import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { claimsForEmployer } from "@/lib/claims/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/claims — cancellation claims against this employer's shifts.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const scope = await resolveEmployerScope(p);
    const claims = await claimsForEmployer(scope.tenantIds, [p.userId]);
    return NextResponse.json({ claims });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
