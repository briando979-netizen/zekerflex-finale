import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { setCardStatus } from "@/lib/bank/cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ status: z.enum(["active", "inactive", "canceled"]) });

// PATCH /api/me/bank/cards/:id — freeze, unfreeze (also: activate a delivered physical card) or cancel.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { id } = await params;
    const { status } = schema.parse(await request.json().catch(() => ({})));
    const { account, canMoveMoney } = await accountForPrincipal(p);
    if (!canMoveMoney) throw AppError.forbidden("Alleen de hoofdbeheerder beheert de passen van de bedrijfsrekening");
    const card = await setCardStatus(id, account.id, status);
    await recordAudit({
      category: "BILLING",
      action: `bank.card_${status}`,
      actorUserId: p.userId,
      summary: `Pas …${card.last4} → ${status}`,
      targetType: "bank-account",
      targetId: account.id,
    });
    return NextResponse.json({ card: { id: card.id, status: card.status } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
