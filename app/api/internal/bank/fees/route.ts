import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { chargeMonthlyFees } from "@/lib/bank/fees";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron entrypoint: charges ZekerFlex Bank monthly account fees that are due.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const result = await chargeMonthlyFees();
    recordCronRun("bank-monthly-fees", true);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    recordCronRun("bank-monthly-fees", false);
    logger.error("bank monthly fees failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Fees failed" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
