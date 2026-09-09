import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { runRetentionSweep } from "@/lib/privacy/sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron entrypoint: apply the retention schedule's delete-on-expiry rules.
// Daily is plenty. `?dryRun=1` reports counts without deleting.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: gate.message } },
      { status: gate.status },
    );
  }
  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const result = await runRetentionSweep({ dryRun });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("retention sweep failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Sweep failed" } },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
