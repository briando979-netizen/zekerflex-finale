import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronHeartbeat } from "@/lib/ops/heartbeat";
import { verwerkWachtrij } from "@/lib/video/wachtrij";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elke 10 minuten (deploy/cron/entrypoint.sh): de video-wachtrij verder afwerken
// (lib/video/wachtrij.ts). Start de ronde en antwoordt meteen; een ronde duurt
// hooguit 8 minuten en draait nooit twee keer tegelijk.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  void verwerkWachtrij().then(
    () => recordCronHeartbeat("video-wachtrij", true),
    () => recordCronHeartbeat("video-wachtrij", false),
  );
  return NextResponse.json({ ok: true, gestart: true }, { status: 202 });
}

export const GET = handle;
export const POST = handle;
