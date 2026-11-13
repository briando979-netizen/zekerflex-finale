import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { draaiRondgang } from "@/lib/ops/rondgang";
import { controleerCertificaten } from "@/lib/ops/certificaten";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Elke nacht (deploy/cron/entrypoint.sh): elke openbare pagina van de site
// ophalen; wat kapot is komt in het foutenlogboek (lib/ops/rondgang.ts).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    const uitslag = await draaiRondgang();
    // de certificaten van onze domeinen: 14 dagen vóór het verlopen een melding (lib/ops/certificaten.ts); een storing
    // hier laat de rondgang staan
    const certificaten = await controleerCertificaten().catch((err: unknown) => {
      logger.warn("certificaten niet gemeten", { error: (err as Error).message });
      return null;
    });
    recordCronRun("rondgang", true);
    return NextResponse.json({ ...uitslag, certificaten });
  } catch (err) {
    recordCronRun("rondgang", false);
    logger.error("rondgang mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "De rondgang is mislukt." } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
