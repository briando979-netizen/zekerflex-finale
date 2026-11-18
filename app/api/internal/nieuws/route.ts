import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { kvGet } from "@/lib/storage/kv";
import { K_STATUS, uitrolHoudtModelStil, type LiveStatus } from "@/lib/bouwer/live";
import { logger } from "@/lib/logger";
import { loopNieuwsNa, NIEUWS_JOB } from "@/lib/nieuws/ronde";
import { echteNieuwsAfhankelijkheden } from "@/lib/nieuws/ronde-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

// Vier keer per dag (deploy/cron/entrypoint.sh): de nieuwsroom bijwerken (lib/nieuws/ronde.ts). Hooguit twee nieuwe
// berichten per ronde. Tijdens een uitrol staat het eigen model stil: dan slaan we de beurt over (telt als gelukt,
// zoals social/tick), de volgende ronde is de herkansing.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  if (uitrolHoudtModelStil(await kvGet<LiveStatus>(K_STATUS).catch(() => null))) {
    await recordCronHeartbeat(NIEUWS_JOB, true);
    return NextResponse.json({ ok: true, overgeslagen: "uitrol bezig" });
  }
  try {
    const s = await loopNieuwsNa(echteNieuwsAfhankelijkheden());
    logger.info("nieuwsronde", { bekeken: s.bekeken, paste: s.paste, geschreven: s.geschreven, geplaatst: s.geplaatst, afgekeurd: s.afgekeurd.length, fout: s.fout ?? null });
    await recordCronHeartbeat(NIEUWS_JOB, true);
    return NextResponse.json({ ok: true, bekeken: s.bekeken, paste: s.paste, geschreven: s.geschreven, geplaatst: s.geplaatst, afgekeurd: s.afgekeurd.length });
  } catch (e) {
    await recordCronHeartbeat(NIEUWS_JOB, false);
    return NextResponse.json({ error: { code: "INTERNAL", message: (e as Error).message } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
