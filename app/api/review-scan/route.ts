import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { recordServerEvent } from "@/lib/analytics/track";
import { ScanFout } from "@/lib/review-scan/places";
import { getReviewScan, runReviewScan } from "@/lib/review-scan/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  tekst: z.string().trim().max(500).optional(),
  placeId: z.string().trim().max(300).optional(),
});

// POST /api/review-scan — gratis review-scan van een bedrijf op Google. Elke scan
// kost Google-verzoeken (betaald), dus per bezoeker én per dag begrensd; hetzelfde
// bedrijf binnen een dag geeft het bewaarde rapport (lib/review-scan/run.ts).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "review-scan",
      identifier: clientIp(request),
      limit: 6,
      windowSeconds: 600,
      message: "Je hebt net een paar scans gedaan. Probeer het over tien minuten opnieuw.",
    });
    await enforceRateLimit({
      name: "review-scan-day",
      identifier: "all",
      limit: 300,
      windowSeconds: 86_400,
      message: "Het is vandaag erg druk met review-scans. Probeer het morgen opnieuw.",
    });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || (!parsed.data.tekst && !parsed.data.placeId)) throw AppError.validation("Vul je Google-link, website of bedrijfsnaam met plaats in.");
    const uitkomst = await runReviewScan(parsed.data);
    if (uitkomst.soort === "rapport") {
      void recordServerEvent({ path: "/review-check", label: "review-scan", meta: { score: uitkomst.rapport.score, aantal: uitkomst.rapport.aantal } });
    }
    return NextResponse.json({ ok: true, ...uitkomst });
  } catch (err) {
    if (err instanceof ScanFout) {
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.code === "GOOGLE" || err.code === "GEEN_SLEUTEL" ? 503 : 422 });
    }
    const res = jsonError(err);
    if (res.status >= 500) logger.error("review-scan mislukt", { error: (err as Error).message });
    return res;
  }
}

// GET /api/review-scan?id=<id> — een bewaard rapport (de link is de sleutel).
export async function GET(request: Request): Promise<NextResponse> {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const rapport = await getReviewScan(id);
  if (!rapport) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Dit rapport bestaat niet (meer)." } }, { status: 404 });
  return NextResponse.json({ ok: true, rapport });
}
