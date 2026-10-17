import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { closePot, movePot } from "@/lib/bank/pots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  direction: z.enum(["in", "out"]),
  amountCents: z.number().int().min(1).max(100_000_000),
  requestKey: z.string().regex(/^[\w-]{8,64}$/),
});

async function ownAccount() {
  const p = await requirePrincipal();
  const { account, canMoveMoney, role } = await accountForPrincipal(p);
  if (!canMoveMoney || role === "platform") throw AppError.forbidden("Je kunt op deze rekening geen potjes beheren");
  return account;
}

// POST /api/me/bank/pots/:id — move money into or out of a pot.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const account = await ownAccount();
    const { id } = await params;
    const input = schema.parse(await request.json().catch(() => ({})));
    await movePot({ potId: id, accountId: account.id, ...input });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/me/bank/pots/:id — close a pot; what's in it goes back to the main balance.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const account = await ownAccount();
    const { id } = await params;
    await closePot(id, account.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
