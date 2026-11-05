import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { tick } from "@/lib/bronnen/tick";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elk uur (deploy/cron): de bronnen ophalen die aan de beurt zijn (lib/bronnen/tick.ts).
export async function GET(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    return NextResponse.json(await tick());
  } catch (err) {
    logger.error("bronnen tick failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Bronnen ophalen mislukt" } }, { status: 500 });
  }
}
