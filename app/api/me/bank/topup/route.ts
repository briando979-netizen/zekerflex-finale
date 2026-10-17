import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { createBankTopupSession } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ amountCents: z.number().int().min(500).max(500_000), returnPath: z.string().regex(/^\/[\w/-]{0,80}$/) });

// POST /api/me/bank/topup — Stripe Checkout to add money; the webhook books it.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "bank-topup", identifier: p.userId, limit: 20, windowSeconds: 3600, message: "Te veel pogingen — probeer het later opnieuw." });
    const input = schema.parse(await request.json().catch(() => ({})));
    const { account, canMoveMoney } = await accountForPrincipal(p);
    if (!canMoveMoney) throw AppError.forbidden("Alleen de hoofdbeheerder kan de bedrijfsrekening opwaarderen");
    if (account.frozenAt) throw AppError.precondition("Deze rekening is geblokkeerd");
    const session = await createBankTopupSession({
      bankAccountId: account.id,
      accountNumber: account.number,
      amountCents: input.amountCents,
      email: p.email,
      returnPath: input.returnPath,
    });
    if (!session.url) throw AppError.upstream("Stripe gaf geen betaalpagina terug");
    return NextResponse.json({ url: session.url });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
