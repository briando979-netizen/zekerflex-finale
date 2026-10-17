import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { payRequest } from "@/lib/bank/p2p";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/bank/requests/:id/pay — pay someone's betaalverzoek from the own balance.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "bank-request-pay", identifier: p.userId, limit: 30, windowSeconds: 3600, message: "Te veel betalingen in korte tijd." });
    const { id } = await params;
    const { account, canMoveMoney, role } = await accountForPrincipal(p);
    if (!canMoveMoney || role === "platform") throw AppError.forbidden("Je kunt vanaf deze rekening niet betalen");
    const paid = await payRequest(id, account);
    await recordAudit({
      category: "BILLING",
      action: "bank.request_paid",
      actorUserId: p.userId,
      summary: `Betaalverzoek ${(paid.amountCents / 100).toFixed(2)} EUR aan ${paid.holderName} betaald`,
      targetType: "bank-account",
      targetId: account.id,
    });
    return NextResponse.json({ request: paid });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
