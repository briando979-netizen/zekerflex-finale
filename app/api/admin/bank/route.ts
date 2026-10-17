import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { getStripeClient } from "@/lib/billing/stripe";
import { formatAccountNumber, platformAccount } from "@/lib/bank/accounts";
import { getFees } from "@/lib/bank/fees";
import { listWithdrawals } from "@/lib/bank/withdrawals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/bank — every ZekerFlex Bank account, what the platform owes its
// customers vs. what Stripe holds, fees and withdrawals waiting for payout.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const platform = await platformAccount();
  const [accounts, sums, potSums, fees, withdrawals, stripeBalance] = await Promise.all([
    prisma.bankAccount.findMany({ orderBy: { balanceCents: "desc" }, take: 300 }),
    prisma.bankAccount.groupBy({ by: ["ownerType"], _sum: { balanceCents: true }, _count: true }),
    prisma.bankPot.aggregate({ where: { closedAt: null }, _sum: { balanceCents: true } }),
    getFees(),
    listWithdrawals({ status: ["pending", "exported"] }),
    env.STRIPE_SECRET_KEY
      ? getStripeClient()
          .balance.retrieve()
          .then((b) => ({
            availableCents: b.available.filter((x) => x.currency === "eur").reduce((s, x) => s + x.amount, 0),
            pendingCents: b.pending.filter((x) => x.currency === "eur").reduce((s, x) => s + x.amount, 0),
          }))
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  const byType = (t: string) => sums.find((s) => s.ownerType === t);
  // Money in pots and deposits is still owed to the customer.
  const potsCents = potSums._sum.balanceCents ?? 0;
  const customerCents = (byType("USER")?._sum.balanceCents ?? 0) + (byType("TENANT")?._sum.balanceCents ?? 0) + potsCents;
  return NextResponse.json({
    platform: { id: platform.id, number: formatAccountNumber(platform.number), balanceCents: platform.balanceCents },
    totals: {
      personalCents: byType("USER")?._sum.balanceCents ?? 0,
      personalCount: byType("USER")?._count ?? 0,
      organisationCents: byType("TENANT")?._sum.balanceCents ?? 0,
      organisationCount: byType("TENANT")?._count ?? 0,
      customerCents,
      potsCents,
      pendingWithdrawalCents: withdrawals.reduce((s, w) => s + w.amountCents, 0),
    },
    stripe: stripeBalance,
    sepaConfigured: Boolean(env.SEPA_CREDITOR_IBAN && env.SEPA_CREDITOR_NAME),
    fees,
    withdrawals,
    accounts: accounts.map((a) => ({
      id: a.id,
      ownerType: a.ownerType,
      number: formatAccountNumber(a.number),
      holderName: a.holderName,
      balanceCents: a.balanceCents,
      frozen: Boolean(a.frozenAt),
      frozenReason: a.frozenReason,
      payoutIban: a.payoutIban ? `${a.payoutIban.slice(0, 4)} …${a.payoutIban.slice(-4)}` : null,
      createdAt: a.createdAt,
    })),
  });
});
