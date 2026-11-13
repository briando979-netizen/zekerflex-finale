import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { AppError } from "@/lib/errors";
import { startControle } from "@/lib/bouwer/controles";
import { liveVersie } from "@/lib/bouwer/versie";
import { bouwerIngesteld } from "@/lib/bouwer/werker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elke 10 minuten (deploy/cron/entrypoint.sh): laat de Bouwer de nieuwste GitHub
// main alvast controleren (TypeScript, eslint, tests; lib/bouwer/controles.ts). Is
// die vastlegging al gecontroleerd, dan is de Bouwer er in seconden klaar mee; loopt
// er al een controle of is hij aan het werk, dan is dat geen fout (volgende ronde).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  if (!bouwerIngesteld()) {
    void recordCronHeartbeat("controles-tick", true);
    return NextResponse.json({ overgeslagen: "Bouwer niet geïnstalleerd" });
  }
  try {
    const { bezig } = await startControle("main", "planner", false, liveVersie()?.sha);
    void recordCronHeartbeat("controles-tick", true);
    return NextResponse.json({ gestart: true, bezig });
  } catch (err) {
    if (err instanceof AppError && err.status === 409) {
      void recordCronHeartbeat("controles-tick", true);
      return NextResponse.json({ gestart: false, reden: err.message });
    }
    void recordCronHeartbeat("controles-tick", false);
    logger.error("controles tick failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Controle starten mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
