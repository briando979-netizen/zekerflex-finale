import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { createPot, getSavingsRates, listPots, openDeposit } from "@/lib/bank/pots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(1).max(40),
    emoji: z.string().max(8).default("🎯"),
    targetCents: z.number().int().min(100).max(100_000_000).nullable().default(null),
  }),
  z.object({
    action: z.literal("deposit"),
    amountCents: z.number().int().min(10_000).max(100_000_000),
    termYears: z.number().int().min(1).max(30),
    requestKey: z.string().regex(/^[\w-]{8,64}$/),
  }),
]);

// GET /api/me/bank/pots — the caller's pots/deposits and the current savings rates.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { account } = await accountForPrincipal(p);
    const [pots, rates] = await Promise.all([listPots(account.id), getSavingsRates()]);
    return NextResponse.json({ pots, rates });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/bank/pots — create a pot, or open a fixed-term deposit.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const input = schema.parse(await request.json().catch(() => ({})));
    const { account, canMoveMoney, role } = await accountForPrincipal(p);
    if (!canMoveMoney || role === "platform") throw AppError.forbidden("Je kunt op deze rekening geen potjes beheren");
    if (input.action === "create") {
      return NextResponse.json({ pot: await createPot({ accountId: account.id, name: input.name, emoji: input.emoji, targetCents: input.targetCents }) }, { status: 201 });
    }
    const pot = await openDeposit({ accountId: account.id, amountCents: input.amountCents, termYears: input.termYears, requestKey: input.requestKey });
    await recordAudit({
      category: "BILLING",
      action: "bank.deposit_opened",
      actorUserId: p.userId,
      summary: `Deposito ${(input.amountCents / 100).toFixed(2)} EUR, ${input.termYears} jaar`,
      targetType: "bank-account",
      targetId: account.id,
    });
    return NextResponse.json({ pot }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
