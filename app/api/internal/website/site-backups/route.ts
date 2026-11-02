import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { runSiteBackups } from "@/lib/website/site-backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elke nacht (deploy/cron/entrypoint.sh): back-ups van de beheerde klantsites.
// Loopt op de achtergrond verder (grote sites kunnen lang duren); de taak zet
// zelf zijn hartslag en meldt mislukte sites aan de eigenaar.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  void runSiteBackups().catch((err) => {
    recordCronRun("site-backups", false);
    logger.error("site backups crashed", { error: (err as Error).message });
  });
  return NextResponse.json({ started: true });
}

export const GET = handle;
export const POST = handle;
