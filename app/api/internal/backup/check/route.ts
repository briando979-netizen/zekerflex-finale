import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { checkBackup, checkDisk } from "@/lib/ops/backup";
import { checkGeheugen } from "@/lib/ops/geheugen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dagelijks na de nachtelijke back-up (deploy/cron/entrypoint.sh): controleert
// of de dump vers, compleet en proef-teruggezet is, en hoe vol de serverschijf
// is. Waarschuwt de eigenaar als iets niet klopt (lib/ops/backup.ts).
// ?alleen=schijf (elk uur): alleen de schijf, want uitrollen vullen hem overdag.
// ?alleen=geheugen (elke 10 minuten): alleen het geheugen van de server (lib/ops/geheugen.ts).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    if (new URL(request.url).searchParams.get("alleen") === "geheugen") {
      const g = await checkGeheugen();
      return NextResponse.json({ beschikbaarMb: g?.beschikbaarMb ?? null, wisselPercent: g?.wisselPercent ?? null });
    }
    if (new URL(request.url).searchParams.get("alleen") === "schijf") {
      const disk = await checkDisk();
      return NextResponse.json({ diskUsedPercent: disk?.usedPercent ?? null });
    }
    const report = await checkBackup();
    return NextResponse.json({
      available: report.available,
      state: report.state,
      reasons: report.reasons,
      last: report.status ? { at: report.status.at, bytes: report.status.bytes, restore: report.status.restore } : null,
      kept: report.files.length,
      diskUsedPercent: report.disk?.usedPercent ?? null,
    });
  } catch (err) {
    logger.error("backup check failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Backup check failed" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
