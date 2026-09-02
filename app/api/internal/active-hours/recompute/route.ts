import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { refreshAllActiveHours } from "@/lib/engagement/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron entrypoint: recompute learned active hours for recently-active
// freelancers. Hit every few hours with the internal token.

async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: gate.message } },
      { status: gate.status },
    );
  }
  try {
    const result = await refreshAllActiveHours();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("active-hours recompute failed", {
      error: (err as Error).message,
    });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: "Recompute failed" } },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
