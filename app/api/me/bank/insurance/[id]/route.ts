import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { cancelPolicy } from "@/lib/bank/insurance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/me/bank/insurance/:id — the holder stops their own policy (no further premiums).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { id } = await params;
    const { account, canMoveMoney } = await accountForPrincipal(p);
    if (!canMoveMoney) throw AppError.forbidden("Alleen de rekeninghouder kan opzeggen");
    const policy = await cancelPolicy(id, account.id);
    await recordAudit({
      category: "BILLING",
      action: "bank.insurance_cancelled",
      actorUserId: p.userId,
      summary: `Verzekering opgezegd: ${policy.productName}`,
      targetType: "bank-account",
      targetId: account.id,
    });
    return NextResponse.json({ policy });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
