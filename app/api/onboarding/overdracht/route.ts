import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { maakOverdracht, overdrachtStatus } from "@/lib/kyc/overdracht";

// "Verder op je telefoon" (lib/kyc/overdracht.ts), de kant van de laptop:
// POST maakt een eenmalige code voor de QR-code (20 min), GET zegt hoe het staat
// ("wacht", "geopend", "klaar", "verlopen"). Alleen de eigen overdracht.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    await enforceRateLimit({ name: "id-overdracht-start", identifier: principal.userId, limit: 15, windowSeconds: 3600 });
    const code = await maakOverdracht(principal.userId);
    return NextResponse.json({ code }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) logger.error("overdracht starten mislukt", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    return NextResponse.json({ overdracht: await overdrachtStatus(principal.userId) }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
