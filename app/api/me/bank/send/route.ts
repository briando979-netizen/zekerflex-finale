import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { findByNumber, sendMoney } from "@/lib/bank/p2p";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  toNumber: z.string().min(12).max(20),
  amountCents: z.number().int().min(1).max(250_000),
  description: z.string().max(140).default(""),
  requestKey: z.string().regex(/^[\w-]{8,64}$/),
});

// GET /api/me/bank/send?number=ZF… — name check before sending (like a bank's "naam-check").
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "bank-name-check", identifier: p.userId, limit: 30, windowSeconds: 3600, message: "Te veel opzoekingen." });
    const account = await findByNumber(new URL(request.url).searchParams.get("number") ?? "");
    if (!account || account.ownerType === "PLATFORM") return NextResponse.json({ found: false });
    return NextResponse.json({ found: true, holderName: account.holderName });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/bank/send — instant transfer to another ZekerFlex Bank account.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "bank-send", identifier: p.userId, limit: 30, windowSeconds: 3600, message: "Te veel overboekingen in korte tijd." });
    const input = schema.parse(await request.json().catch(() => ({})));
    const { account, canMoveMoney, role } = await accountForPrincipal(p);
    if (!canMoveMoney || role === "platform") throw AppError.forbidden("Je kunt vanaf deze rekening niet overmaken");
    const { toHolder } = await sendMoney({ from: account, ...input });
    await recordAudit({
      category: "BILLING",
      action: "bank.transfer_sent",
      actorUserId: p.userId,
      summary: `${(input.amountCents / 100).toFixed(2)} EUR naar ${toHolder}`,
      targetType: "bank-account",
      targetId: account.id,
    });
    return NextResponse.json({ ok: true, toHolder });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
