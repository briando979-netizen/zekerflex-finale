import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { buildForecast, buildInsights } from "@/lib/bank/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/bank/insights — income/spending per month + category, and the 30-day balance forecast.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const { account } = await accountForPrincipal(p);
    const [insights, forecast] = await Promise.all([buildInsights(account.id), buildForecast(account)]);
    return NextResponse.json({ insights, forecast });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
