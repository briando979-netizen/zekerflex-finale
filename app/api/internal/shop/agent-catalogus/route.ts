import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { synchroniseerAgentCatalogus } from "@/lib/shop/agent-handel-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron (elk kwartier): de productlijst voor AI-assistenten bij Stripe bijwerken,
// alleen wat veranderde (lib/shop/agent-handel-server.ts). Een fout van Stripe
// staat in Admin → Verkoop via AI en telt niet als mislukte cron: de ronde zelf
// liep, en de wachttijd na een fout regelt het opnieuw proberen.
// Eigen shared-secret auth (x-internal-token).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const { uitslag, stand } = await synchroniseerAgentCatalogus();
    recordCronRun("agent-catalogus", true);
    return NextResponse.json({ uitslag, regels: stand.regels ?? 0, fout: stand.fout?.bericht ?? null });
  } catch (err) {
    recordCronRun("agent-catalogus", false);
    logger.error("agent-catalogus mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Ronde mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
