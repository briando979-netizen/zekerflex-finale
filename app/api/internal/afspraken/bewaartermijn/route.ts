import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { wisVerlopenAfspraken } from "@/lib/afspraken/bewaren";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron entrypoint: de persoonsgegevens (naam, telefoon, e-mail, opmerking) in afspraken ouder dan 2 jaar wissen
// (lib/afspraken/bewaren.ts). Elke nacht is genoeg. `?dryRun=1` telt alleen, en wist niets.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const result = await wisVerlopenAfspraken({ dryRun });
    recordCronRun("afspraken-bewaartermijn", true);
    return NextResponse.json({ ok: true, dryRun, ...result });
  } catch (err) {
    recordCronRun("afspraken-bewaartermijn", false);
    logger.error("afspraken bewaartermijn mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Bewaartermijn mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
