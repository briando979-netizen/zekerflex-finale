import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { socialTick } from "@/lib/social/publiceer";
import { kvGet } from "@/lib/storage/kv";
import { K_STATUS, uitrolHoudtModelStil, type LiveStatus } from "@/lib/bouwer/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Elke 10 minuten (deploy/cron/entrypoint.sh): goedgekeurde berichten die aan de beurt zijn plaatsen
// (Facebook en Instagram via de Meta-koppeling; de rest staat klaar voor een mens) en, als de
// autopilot aan staat, een week aan berichten klaarzetten (lib/social/publiceer.ts).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  // tijdens een uitrol staat het eigen model stil (13 nov: "berichten vielen terug op vaste teksten" na 180 s): deze tik
  // overslaan; de volgende, 10 minuten later, is de herkansing. De overgeslagen tik telt als gelukt voor de
  // hartslagbewaking (zoals ai/warm): 13 nov volgden er uitrollen achter elkaar, zonder hartslag zag de
  // bewaking na 2 uur "taak draait niet" en kwam er een vals alarm
  if (uitrolHoudtModelStil(await kvGet<LiveStatus>(K_STATUS).catch(() => null))) {
    await recordCronHeartbeat("social-tick", true);
    return NextResponse.json({ ok: true, overgeslagen: "uitrol bezig" });
  }
  try {
    const r = await socialTick();
    await recordCronHeartbeat("social-tick", true);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    await recordCronHeartbeat("social-tick", false);
    return NextResponse.json({ error: { code: "INTERNAL", message: (e as Error).message } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
