import { NextResponse } from "next/server";
import { hasRole, requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { meetDocumentLive } from "@/lib/kyc/document-live";

// ---------------------------------------------------------------------------
// POST /api/onboarding/document-live?mrz=1&portret=1 — de camera van de ID-scan stuurt de uitsnede van het kader
// (zodra het beeld scherp en stil is, lib/kyc/camera-live.ts) en krijgt terug of de code onderaan leesbaar is en
// hoe groot de pasfoto in het kader staat. Zo kan het scherm zeggen "kom iets dichterbij" of "houd de camera iets
// verder weg", en de foto vanzelf maken. Alleen voor een ingelogde werker. Het beeld wordt niet bewaard en niet
// gelogd; het antwoord bevat alleen ja/nee en een getal, nooit de inhoud van de code (die bevat het BSN).
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Een uitsnede van het kader (hooguit ±1400 pixels breed) als JPEG is ±100–400 kB. */
const MAX_BYTES = 1_500_000;
const TOEGESTAAN = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    // 423 en geen 403: een fout account mag CrowdSec niet laten denken aan een inbraakpoging
    if (!hasRole(principal, "FREELANCER")) {
      return NextResponse.json({ error: { code: "ALLEEN_WERKER", message: "Dit kan alleen met een werkersaccount." } }, { status: 423, headers: { "Cache-Control": "no-store" } });
    }
    // hoogstens ongeveer één meting per seconde, alleen als het beeld al scherp en stil is; ruim genoeg om een paar keer opnieuw te beginnen
    await enforceRateLimit({
      name: "document-live",
      identifier: principal.userId,
      limit: 300,
      windowSeconds: 3600,
      message: "De camera heeft vaak gemeten. Maak de foto gewoon met de knop: dan kijken wij mee.",
    });

    const url = new URL(request.url);
    const wat = { mrz: url.searchParams.get("mrz") === "1", portret: url.searchParams.get("portret") === "1" };
    if (!wat.mrz && !wat.portret) throw AppError.validation("Geef aan wat er gemeten moet worden.");

    const soort = (request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (!TOEGESTAAN.has(soort)) throw AppError.validation("Stuur een JPG-, PNG- of WebP-beeld.");
    const lengte = Number(request.headers.get("content-length") ?? "0");
    if (lengte > MAX_BYTES) throw AppError.validation("Het beeld is te groot voor live meten.");
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_BYTES) throw AppError.validation("Het beeld is leeg of te groot voor live meten.");

    const meting = await meetDocumentLive(bytes, wat);
    return NextResponse.json({ meting }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    // nooit het beeld of de gelezen code loggen: alleen dat het misging
    if (status >= 500) logger.error("document live meten mislukt", { soort: (err as Error).name });
    return NextResponse.json(body, { status, headers: { ...headers, "Cache-Control": "no-store" } });
  }
}
