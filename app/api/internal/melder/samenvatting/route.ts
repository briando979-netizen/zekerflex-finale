import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { stuurSamenvatting } from "@/lib/ops/melder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elk uur op :50 (deploy/cron/entrypoint.sh): het uurbericht voor de eigenaar met alles wat automatisch is gedaan en nog
// niet direct is gemeld (lib/ops/melder.ts). Alleen tussen 07:00 en 23:00 Amsterdam; ruimt ook het logboek op (30 dagen).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    const uitslag = await stuurSamenvatting();
    void recordCronHeartbeat("melder-samenvatting", true);
    return NextResponse.json(uitslag);
  } catch (err) {
    void recordCronHeartbeat("melder-samenvatting", false);
    logger.error("melder samenvatting failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Samenvatting mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
