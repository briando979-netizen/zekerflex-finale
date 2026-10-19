import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { sweepClaimCollections } from "@/lib/claims/collections-sweep";
import { runInvoiceReminders } from "@/lib/billing/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron entrypoint: WIK-conforme herinnering -> incasso-escalatie -> ban voor
// onbetaalde annuleringsclaim-facturen. Daily is genoeg — de kortste stap in
// de keten is 14 dagen.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: gate.message } },
      { status: gate.status },
    );
  }
  // Payment reminders for ordinary client invoices ride along on this daily
  // collections run; its own try so a failure there never blocks the claims flow.
  let reminders: Awaited<ReturnType<typeof runInvoiceReminders>> | { error: string };
  try {
    reminders = await runInvoiceReminders();
    recordCronRun("invoice-reminders", true);
  } catch (err) {
    recordCronRun("invoice-reminders", false);
    logger.error("invoice reminders failed", { error: (err as Error).message });
    reminders = { error: "failed" };
  }
  try {
    const result = await sweepClaimCollections();
    recordCronRun("claim-collections-sweep", true);
    return NextResponse.json({ ok: true, ...result, reminders });
  } catch (err) {
    recordCronRun("claim-collections-sweep", false);
    logger.error("claim collections sweep failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Sweep failed" } },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
