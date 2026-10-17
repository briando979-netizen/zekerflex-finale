import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { cancelRequest } from "@/lib/bank/p2p";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/me/bank/requests/:id — withdraw an open payment request.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { id } = await params;
    const { account } = await accountForPrincipal(p);
    await cancelRequest(id, account.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
