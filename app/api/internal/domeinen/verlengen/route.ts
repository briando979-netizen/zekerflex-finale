import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { runDomeinVerlengingen } from "@/lib/domeinen/verlengen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Alleen de domeinronde (vastleggen wat bleef hangen, verlengfacturen, incasso,
// herinneringen, opzeggen; lib/domeinen/verlengen.ts). Dagelijks draait hij al
// mee in /api/internal/claims/collections-sweep; deze route is voor een
// losse run (na een storing, of een livetest) zonder de andere taken.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    const ronde = await runDomeinVerlengingen();
    recordCronRun("domein-verlengen", true);
    return NextResponse.json({ ok: true, ...ronde });
  } catch (err) {
    recordCronRun("domein-verlengen", false);
    logger.error("domain renewals failed", { error: (err as Error).message });
    return NextResponse.json({ ok: false, error: { code: "INTERNAL", message: "Domeinronde mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
