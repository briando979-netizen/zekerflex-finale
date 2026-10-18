import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { updateStanding } from "@/lib/bank/standing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function own() {
  const p = await requirePrincipal();
  const { account, canMoveMoney } = await accountForPrincipal(p);
  if (!canMoveMoney) throw AppError.forbidden("Niet toegestaan");
  return account;
}

// PATCH /api/me/bank/standing/:id — pause or resume.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const account = await own();
    const { id } = await params;
    const { active } = z.object({ active: z.boolean() }).parse(await request.json().catch(() => ({})));
    await updateStanding(id, account.id, { active });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/me/bank/standing/:id — stop for good.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const account = await own();
    const { id } = await params;
    await updateStanding(id, account.id, { delete: true });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
