import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { sweepClaimCollections } from "@/lib/claims/collections-sweep";

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
  try {
    const result = await sweepClaimCollections();
    recordCronRun("claim-collections-sweep", true);
    return NextResponse.json({ ok: true, ...result });
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
