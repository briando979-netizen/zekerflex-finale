import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { biIngesteld, leesBiStand, richtBiIn } from "@/lib/bi/metabase";
import { recordCronRun } from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elk uur (deploy/cron): Metabase inrichten als dat nog niet gelukt is, en elke
// nacht om 04:00 opnieuw (views en kaarten bijwerken na een nieuwe versie).
export async function GET(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  if (!biIngesteld()) return NextResponse.json({ overgeslagen: "METABASE_URL ontbreekt" });
  const stand = await leesBiStand();
  const uur = new Date().getUTCHours();
  const nodig = !stand.ingerichtOp || stand.laatsteFout || uur === 4;
  if (!nodig) {
    recordCronRun("bi-setup", true);
    return NextResponse.json({ overgeslagen: "al ingericht", ingerichtOp: stand.ingerichtOp });
  }
  const nieuw = await richtBiIn();
  recordCronRun("bi-setup", !nieuw.laatsteFout);
  return NextResponse.json({ ingerichtOp: nieuw.ingerichtOp, fout: nieuw.laatsteFout, dashboardId: nieuw.dashboardId });
}
