import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { accountForPrincipal, formatAccountNumber } from "@/lib/bank/accounts";
import { getFees, monthlyFeeFor } from "@/lib/bank/fees";
import { env } from "@/lib/env";
import { getPayoutDestination } from "@/lib/bank/earnings";
import { cardMeta } from "@/lib/bank/cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/bank — the caller's ZekerFlex Bank account (opened on first visit), recent bookings and cards.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { account, canMoveMoney, role } = await accountForPrincipal(p);
    const take = Math.min(200, Number(new URL(request.url).searchParams.get("take") ?? 50) || 50);
    const [entries, cards, fees] = await Promise.all([
      prisma.bankEntry.findMany({ where: { accountId: account.id }, orderBy: { createdAt: "desc" }, take }),
      prisma.bankCard.findMany({ where: { accountId: account.id }, orderBy: { createdAt: "desc" } }),
      getFees(),
    ]);
    return NextResponse.json({
      account: {
        id: account.id,
        number: formatAccountNumber(account.number),
        holderName: account.holderName,
        balanceCents: account.balanceCents,
        currency: account.currency,
        payoutIban: account.payoutIban,
        payoutName: account.payoutName,
        frozen: Boolean(account.frozenAt),
        frozenReason: account.frozenReason,
        nextFeeAt: account.nextFeeAt,
      },
      role,
      canMoveMoney,
      stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY ?? null,
      payoutDestination: role === "personal" ? await getPayoutDestination(p.userId) : null,
      fees: {
        monthlyCents: monthlyFeeFor(account, fees),
        cardVirtualCents: fees.cardVirtualCents,
        cardPhysicalCents: fees.cardPhysicalCents,
        negativeBalanceCents: fees.negativeBalanceFeeCents,
      },
      entries,
      cards: await Promise.all(
        cards.map(async (c) => ({ id: c.id, stripeCardId: c.stripeCardId, type: c.type, brand: c.brand, last4: c.last4, expMonth: c.expMonth, expYear: c.expYear, status: c.status, ...(await cardMeta(c.id)) })),
      ),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
