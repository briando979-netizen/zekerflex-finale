import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { accountForPrincipal } from "@/lib/bank/accounts";
import { reserveTax, setTaxPct, taxCsv, taxOverview } from "@/lib/bank/tax";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function personal() {
  const p = await requirePrincipal();
  const ctx = await accountForPrincipal(p);
  if (ctx.role !== "personal") throw AppError.forbidden("Belastinghulp is voor zzp'ers");
  return { p, ...ctx };
}

// GET /api/me/bank/tax?year=2026[&format=csv] — quarter overview, or the year as CSV for the accountant.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { p, account } = await personal();
    const url = new URL(request.url);
    const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
    if (url.searchParams.get("format") === "csv") {
      return new NextResponse(await taxCsv(p.userId, year), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="zekerflex-jaaroverzicht-${year}.csv"` },
      });
    }
    return NextResponse.json(await taxOverview(p.userId, account.id, year));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// PUT /api/me/bank/tax — the income-tax reservation percentage.
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const { p } = await personal();
    const { pct } = z.object({ pct: z.number().min(0).max(60) }).parse(await request.json().catch(() => ({})));
    return NextResponse.json(await setTaxPct(p.userId, pct));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/bank/tax — move what's still missing into the Belasting pot.
export async function POST(): Promise<NextResponse> {
  try {
    const { p, account, canMoveMoney } = await personal();
    if (!canMoveMoney || account.frozenAt) throw AppError.forbidden("Je kunt nu niets apart zetten");
    return NextResponse.json({ reservedCents: await reserveTax(p.userId, account.id, account.balanceCents) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
