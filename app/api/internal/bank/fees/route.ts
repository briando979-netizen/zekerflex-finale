import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { chargeMonthlyFees } from "@/lib/bank/fees";
import { chargeDuePremiums } from "@/lib/bank/insurance";
import { matureDeposits } from "@/lib/bank/pots";
import { settleNegativeBalances } from "@/lib/bank/overdraft";
import { runStandingOrders } from "@/lib/bank/standing";
import { runScheduledPayouts } from "@/lib/payouts/execute";
import { autoRisk, autoSepaBatch, coverageCheck } from "@/lib/bank/automation";
import { BANK_AAN } from "@/lib/app-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The daily bank run pages through every account; give it the full budget.
export const maxDuration = 300;

// Cron entrypoint (daily): ZekerFlex Bank monthly fees, insurance premiums and matured deposits.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    // ZekerFlex Bank staat uit (lib/app-mode.ts, BANK_AAN): geen bankkosten, premies, deposito's,
    // vaste opdrachten of rood-staan meer. De uitbetalingen hieronder lopen gewoon door.
    const uit = { overgeslagen: "ZekerFlex Bank staat uit" };
    const fees = BANK_AAN ? await chargeMonthlyFees() : uit;
    const premiums = BANK_AAN ? await chargeDuePremiums() : uit;
    const deposits = BANK_AAN ? await matureDeposits() : uit;
    const standing = BANK_AAN ? await runStandingOrders() : uit;
    // Freelancers who chose payout "within 3 working days".
    const scheduledPayouts = await runScheduledPayouts().catch((e) => ({ error: (e as Error).message }));
    const overdraft = BANK_AAN ? await settleNegativeBalances() : uit;
    // Self-running: risk first (a frozen account's withdrawal still pays out,
    // but no new money moves), then the SEPA batch, then the coverage check.
    const risk = await autoRisk().catch((e) => ({ error: (e as Error).message }));
    const sepa = await autoSepaBatch().catch((e) => ({ error: (e as Error).message }));
    const coverage = await coverageCheck().catch((e) => ({ error: (e as Error).message }));
    recordCronRun("bank-monthly-fees", true);
    return NextResponse.json({ ok: true, fees, premiums, deposits, standing, scheduledPayouts, overdraft, risk, sepa, coverage });
  } catch (err) {
    recordCronRun("bank-monthly-fees", false);
    logger.error("bank monthly fees failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Fees failed" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
