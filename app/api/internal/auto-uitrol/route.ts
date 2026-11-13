import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { autoUitrolRonde } from "@/lib/bouwer/auto-uitrol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Elke 2 minuten (deploy/cron/entrypoint.sh): één ronde van de Auto-uitrol (lib/bouwer/auto-uitrol.ts). Staat hij uit, dan
// alleen de hartslag, zodat "de lus draait niet" altijd opvalt (lib/ops/heartbeat.ts).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    const res = await autoUitrolRonde();
    void recordCronHeartbeat("auto-uitrol", true);
    if (res.besluit.actie === "uitrollen" || res.besluit.actie === "weiger" || res.besluit.actie === "migratie-wacht") {
      logger.info("auto-uitrol", { actie: res.besluit.actie, sha: res.besluit.sha?.slice(0, 10) ?? null });
    }
    return NextResponse.json({ actie: res.besluit.actie, reden: res.besluit.reden, aan: res.aan, noodrem: res.noodrem });
  } catch (err) {
    void recordCronHeartbeat("auto-uitrol", false);
    logger.error("auto-uitrol mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Auto-uitrol mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;