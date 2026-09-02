import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { checkLlm } from "@/lib/ai/watchdog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Daemon hits this on a short interval: pings the local model, tracks up/down
// transitions and keeps the model warm (keep_alive).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: gate.message } },
      { status: gate.status },
    );
  }
  try {
    const state = await checkLlm();
    return NextResponse.json({ ok: true, ...state });
  } catch (err) {
    logger.warn("ai watchdog tick failed", { error: (err as Error).message });
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}

export const GET = handle;
export const POST = handle;
