import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { listWithdrawals, requestWithdrawal } from "@/lib/bank/withdrawals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  amountCents: z.number().int().min(100).max(10_000_000),
  /** client-generated, makes a double click one withdrawal */
  requestKey: z.string().regex(/^[\w-]{8,64}$/),
});

// GET /api/me/bank/withdraw — the caller's withdrawals and their status.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { account } = await accountForPrincipal(p);
    return NextResponse.json({ withdrawals: (await listWithdrawals({ accountId: account.id })).slice(0, 50) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/bank/withdraw — move money to the own IBAN (reserved now, paid out in the next SEPA batch).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "bank-withdraw", identifier: p.userId, limit: 10, windowSeconds: 3600, message: "Te veel opnames in korte tijd." });
    const input = schema.parse(await request.json().catch(() => ({})));
    const { account, canMoveMoney } = await accountForPrincipal(p);
    if (!canMoveMoney) throw AppError.forbidden("Alleen de hoofdbeheerder kan geld opnemen van de bedrijfsrekening");
    if (account.ownerType === "PLATFORM") throw AppError.forbidden("De platformrekening wordt via Stripe uitbetaald");
    const w = await requestWithdrawal({ accountId: account.id, amountCents: input.amountCents, requestKey: input.requestKey });
    await recordAudit({
      category: "BILLING",
      action: "bank.withdrawal_requested",
      actorUserId: p.userId,
      summary: `Opname ${(w.amountCents / 100).toFixed(2)} EUR naar …${w.iban.slice(-4)}`,
      targetType: "bank-account",
      targetId: account.id,
    });
    return NextResponse.json({ withdrawal: w }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
