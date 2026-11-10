import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { socialTick } from "@/lib/social/publiceer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Elke 10 minuten (deploy/cron/entrypoint.sh): goedgekeurde berichten die aan de beurt zijn plaatsen
// (Facebook en Instagram via de Meta-koppeling; de rest staat klaar voor een mens) en, als de
// autopilot aan staat, een week aan berichten klaarzetten (lib/social/publiceer.ts).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
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
