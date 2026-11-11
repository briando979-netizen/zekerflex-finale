import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { stuurHerinneringen } from "@/lib/afspraken/herinneringen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron entrypoint: 24 uur voor een online afspraak een herinnering mailen (lib/afspraken/herinneringen.ts). Elk uur;
// idempotent. `?dryRun=1` telt alleen, en verstuurt of wist niets.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const result = await stuurHerinneringen({ dryRun });
    recordCronRun("afspraken-herinneringen", true);
    return NextResponse.json({ ok: true, dryRun, ...result });
  } catch (err) {
    recordCronRun("afspraken-herinneringen", false);
    logger.error("afspraken herinneringen mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Herinneringen mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
