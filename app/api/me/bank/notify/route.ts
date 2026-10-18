import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { getNotifyPrefs, setNotifyPrefs } from "@/lib/bank/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ incoming: z.boolean(), card: z.boolean(), standing: z.boolean(), lowBalanceCents: z.number().int().min(0).max(1_000_000) });

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { account } = await accountForPrincipal(p);
    return NextResponse.json({ prefs: await getNotifyPrefs(account.id) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// PUT /api/me/bank/notify — which bank notifications this account wants.
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const prefs = schema.parse(await request.json().catch(() => ({})));
    const { account } = await accountForPrincipal(p);
    return NextResponse.json({ prefs: await setNotifyPrefs(account.id, prefs) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
