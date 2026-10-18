import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { setCardControls, setCardMeta, setCardStatus } from "@/lib/bank/cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.union([
  z.object({ status: z.enum(["active", "inactive", "canceled"]) }),
  z.object({
    controls: z.object({ online: z.boolean(), abroad: z.boolean(), gambling: z.boolean(), perPaymentLimitCents: z.number().int().min(100).max(10_000_000).nullable() }),
  }),
  z.object({ assignee: z.string().trim().max(60).nullable(), monthlyLimitCents: z.number().int().min(1_000).max(10_000_000).nullable() }),
]);

// PATCH /api/me/bank/cards/:id — freeze, unfreeze (also: activate a delivered physical card) or cancel.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { id } = await params;
    const input = schema.parse(await request.json().catch(() => ({})));
    const { account, canMoveMoney } = await accountForPrincipal(p);
    if (!canMoveMoney) throw AppError.forbidden("Alleen de hoofdbeheerder beheert de passen van de bedrijfsrekening");
    if ("controls" in input) {
      return NextResponse.json({ controls: await setCardControls(id, account.id, input.controls) });
    }
    if (!("status" in input)) {
      const meta = await setCardMeta(id, account.id, { assignee: input.assignee || null, monthlyLimitCents: input.monthlyLimitCents });
      await recordAudit({
        category: "BILLING",
        action: "bank.card_budget",
        actorUserId: p.userId,
        summary: `Pas ${id}: ${meta.assignee ?? "geen houder"}, budget ${meta.monthlyLimitCents ? `${(meta.monthlyLimitCents / 100).toFixed(0)} EUR/mnd` : "onbeperkt"}`,
        targetType: "bank-account",
        targetId: account.id,
      });
      return NextResponse.json({ meta });
    }
    const { status } = input;
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
