import { NextResponse } from "next/server";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { meetLive } from "@/lib/kyc/gezicht/live";

// ---------------------------------------------------------------------------
// POST /api/onboarding/gezicht-live — de camera van de ID-scan stuurt een klein beeld (hooguit 640 pixels) en
// krijgt terug waar het gezicht staat en hoe het gedraaid is (lib/kyc/gezicht/live.ts). Zo kan het scherm
// zeggen "kijk recht", "draai iets verder" of "goed zo", en de tweede selfie vanzelf maken. Alleen voor een
// ingelogde werker. Het beeld wordt niet bewaard en niet gelogd; het antwoord bevat alleen getallen.
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

/** Een beeld van 640 pixels als JPEG is ±30–80 kB; ruim daarboven is het geen livebeeld. */
const MAX_BYTES = 600_000;
const TOEGESTAAN = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    // 423 en geen 403: een fout account mag CrowdSec niet laten denken aan een inbraakpoging
    if (!hasRole(principal, "FREELANCER")) {
      return NextResponse.json({ error: { code: "ALLEEN_WERKER", message: "Dit kan alleen met een werkersaccount." } }, { status: 423, headers: { "Cache-Control": "no-store" } });
    }
    // ongeveer anderhalf beeld per seconde tijdens de selfies; ruim genoeg om een paar keer opnieuw te beginnen
    await enforceRateLimit({
      name: "gezicht-live",
      identifier: principal.userId,
      limit: 400,
      windowSeconds: 3600,
      message: "De camera heeft vaak gemeten. Maak de foto gewoon met de knop: dan kijken wij mee.",
    });

    const soort = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (!TOEGESTAAN.has(soort)) throw AppError.validation("Stuur een JPG-, PNG- of WebP-beeld.");
    const lengte = Number(request.headers.get("content-length") ?? "0");
    if (lengte > MAX_BYTES) throw AppError.validation("Het beeld is te groot voor live meten.");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) throw AppError.validation("Het beeld is leeg of te groot voor live meten.");

    const meting = await meetLive(bytes);
    return NextResponse.json({ meting }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    // nooit het beeld loggen: alleen dat het misging
    if (status >= 500) logger.error("gezicht live meten mislukt", { error: (err as Error).message });
    return NextResponse.json(body, { status, headers: { ...headers, "Cache-Control": "no-store" } });
  }
}
