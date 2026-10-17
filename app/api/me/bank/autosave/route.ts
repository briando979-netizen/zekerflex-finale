import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { getRules, setRules } from "@/lib/bank/autosave";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  earningPct: z.number().int().min(0).max(100),
  earningPotId: z.string().max(40).nullable(),
  roundUp: z.boolean(),
  roundUpPotId: z.string().max(40).nullable(),
});

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { account } = await accountForPrincipal(p);
    return NextResponse.json({ rules: await getRules(account.id) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// PUT /api/me/bank/autosave — automatic saving rules (share of earnings, round-ups).
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const rules = schema.parse(await request.json().catch(() => ({})));
    const { account, canMoveMoney, role } = await accountForPrincipal(p);
    if (!canMoveMoney || role === "platform") throw AppError.forbidden("Niet voor deze rekening");
    try {
      return NextResponse.json({ rules: await setRules(account.id, rules) });
    } catch (e) {
      throw AppError.validation((e as Error).message);
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
