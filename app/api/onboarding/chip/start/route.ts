import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { startChipSessie } from "@/lib/kyc/chip/sessie";

// POST /api/onboarding/chip/start — een eenmalige code waarmee de app de chip
// van het zojuist gescande document opent (lib/kyc/chip/sessie.ts). De code gaat
// als extra in de intent naar de app, nooit in een adres.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    await enforceRateLimit({ name: "chip-start", identifier: principal.userId, limit: 20, windowSeconds: 3600 });
    const code = await startChipSessie(principal.userId);
    if (!code) throw AppError.conflict("Scan eerst de code op je document, dan kun je de chip lezen.");
    return NextResponse.json({ code }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) logger.error("chip start mislukt", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
