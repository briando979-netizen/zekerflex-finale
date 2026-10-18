import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { VOLUME_TIERS, volumeStatus } from "@/lib/pricing/volume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/volume — this month's hours, the staffel and the fee per hour.
export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const tenantId = (await resolveEmployerScope(principal)).tenantIds[0];
    if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
    return NextResponse.json({ ...(await volumeStatus(tenantId)), tiers: VOLUME_TIERS });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
