import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { sweepSalesOffers } from "@/lib/sales/offers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron: leest de ZekerFlex-mailbox en verwerkt nieuwe offerteaanvragen met de
// offerte-AI (classificeren, extraheren, warme lead, concept-antwoord). Eigen
// shared-secret auth (x-internal-token). No-op zonder mailbox/LLM.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const result = await sweepSalesOffers();
    recordCronRun("sales-offers", result.ok);
    return NextResponse.json(result);
  } catch (err) {
    recordCronRun("sales-offers", false);
    logger.error("offers sweep failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Sweep failed" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
