import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { reindexAll } from "@/lib/rag/reindex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Cron entrypoint: rebuild the local RAG index (codebase, audit, legal, sales,
// platform state, interactions). Run every ~12h.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: gate.message } },
      { status: gate.status },
    );
  }
  try {
    const result = await reindexAll();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("rag reindex failed", { error: (err as Error).message });
    return NextResponse.json(
      { error: { code: "INTERNAL", message: (err as Error).message } },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
