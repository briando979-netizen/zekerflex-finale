import { NextResponse } from "next/server";
import { z } from "zod";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { recordAudit } from "@/lib/audit";
import { fastPayAvailable, getFastPay, updateFastPay } from "@/lib/payouts/fastpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ offerFastPay: z.boolean().optional(), advancesForUitzend: z.boolean().optional() });

async function tenant() {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) throw AppError.precondition("Geen organisatie gekoppeld aan je account");
  return { principal, tenantId };
}

// GET /api/werkgever/fastpay — fast-payout + uitzend-advance settings and the credit check.
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await tenant();
    const s = await getFastPay(tenantId);
    return NextResponse.json({ ...s, available: fastPayAvailable(s) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// PUT /api/werkgever/fastpay — HQ admin turns fast payout / uitzend advances on or off.
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const { principal, tenantId } = await tenant();
    if (!hasRole(principal, "HQ_ADMIN")) throw AppError.forbidden("Alleen de hoofdbeheerder kan dit wijzigen");
    const patch = schema.parse(await request.json().catch(() => ({})));
    const s = await updateFastPay(tenantId, patch);
    await recordAudit({
      category: "BILLING",
      action: "fastpay.settings",
      actorUserId: principal.userId,
      summary: `Snelle uitbetaling ${s.offerFastPay ? "aan" : "uit"} (kredietcheck: ${s.credit.status}, ${s.credit.score}/100), voorschot uitzendkrachten ${s.advancesForUitzend ? "aan" : "uit"}`,
      targetType: "tenant",
      targetId: tenantId,
    });
    return NextResponse.json({ ...s, available: fastPayAvailable(s) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
