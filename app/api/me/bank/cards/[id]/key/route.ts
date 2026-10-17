import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { cardDetailsKey } from "@/lib/bank/cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ nonce: z.string().min(10).max(200) });

// POST /api/me/bank/cards/:id/key — ephemeral key for Stripe Issuing Elements (number/CVC are shown in Stripe's iframe, never by us).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "bank-card-reveal", identifier: p.userId, limit: 20, windowSeconds: 3600, message: "Te vaak de pasgegevens opgevraagd." });
    const { id } = await params;
    const { nonce } = schema.parse(await request.json().catch(() => ({})));
    const { account, canMoveMoney } = await accountForPrincipal(p);
    if (!canMoveMoney) throw AppError.forbidden("Alleen de hoofdbeheerder kan de pasgegevens zien");
    return NextResponse.json(await cardDetailsKey(id, account.id, nonce));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
