import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { bouwerAutoTick } from "@/lib/bouwer/autopilot";
import { dagoverzicht, registreerLiveVersie } from "@/lib/bouwer/geschiedenis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elke 30 minuten (deploy/cron/entrypoint.sh): legt de live versie vast en mailt na
// 18:00 het dagoverzicht (lib/bouwer/geschiedenis.ts), en de Bouwer stelt zelf
// reparaties voor terugkerende fouten voor als de eigenaar dat aanzette (lib/bouwer/autopilot.ts).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    // los van elkaar: een storing in het ene houdt het andere niet tegen
    const geschiedenis = await registreerLiveVersie().then(
      (l) => l.length,
      () => null,
    );
    const dag = await dagoverzicht().catch((err: unknown) => {
      logger.error("dagoverzicht failed", { error: (err as Error).message });
      return "fout" as const;
    });
    const res = await bouwerAutoTick();
    void recordCronHeartbeat("bouwer-auto", true);
    if (res.uitkomst === "gestart" || res.uitkomst === "fout") logger.info("bouwer auto", { ...res });
    return NextResponse.json({ ...res, dagoverzicht: dag, geschiedenis });
  } catch (err) {
    void recordCronHeartbeat("bouwer-auto", false);
    logger.error("bouwer auto failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Bouwer-autopilot mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
