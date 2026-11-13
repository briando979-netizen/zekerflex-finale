import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { bewaarSnapshot } from "@/lib/rag/graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Elke nacht na de RAG-herindexering (deploy/cron/entrypoint.sh): een momentopname van de Kennisgraaf (alleen knoop-id's,
// lijnsleutels en aantallen, geen persoonsgegevens) voor de groeireeks in Admin → Kennisgraaf (lib/rag/graph.ts, groei()).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    const snap = await bewaarSnapshot();
    recordCronRun("kennisgraaf-snapshot", true);
    return NextResponse.json({ ok: true, op: snap.op, ...snap.cijfers });
  } catch (err) {
    recordCronRun("kennisgraaf-snapshot", false);
    logger.error("kennisgraaf-snapshot mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "De momentopname van de kennisgraaf is mislukt." } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
