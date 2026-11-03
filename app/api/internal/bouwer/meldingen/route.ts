import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { bouwerMeldingenTick } from "@/lib/bouwer/meldingen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elke 2 minuten (deploy/cron/entrypoint.sh): een push naar de eigenaar als de Bouwer
// klaar is, een vraag heeft of vastliep, of als het live zetten afrondt (lib/bouwer/meldingen.ts).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    const res = await bouwerMeldingenTick();
    void recordCronHeartbeat("bouwer-meldingen", true);
    if (res.meldingen) logger.info("bouwer meldingen", { ...res });
    return NextResponse.json(res);
  } catch (err) {
    void recordCronHeartbeat("bouwer-meldingen", false);
    logger.error("bouwer meldingen failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Bouwer-meldingen mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
