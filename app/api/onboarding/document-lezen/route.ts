import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { leesMrzVanFoto, voorScherm } from "@/lib/kyc/mrz-lezen";

// ---------------------------------------------------------------------------
// POST /api/onboarding/document-lezen — leest vóór het versturen de MRZ van één
// foto (achterkant ID-kaart of pasfotopagina paspoort) en laat zien wat er
// gelezen is: nummer, vervaldatum, naam, en of de controlecijfers kloppen. Zo
// weet de werker meteen of de foto goed is, in plaats van een vage afwijzing
// achteraf. Er wordt niets bewaard en niets gelogd (de MRZ bevat het BSN).
// ---------------------------------------------------------------------------

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 12_000_000;
const TOEGESTAAN = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "FREELANCER");
    // OCR kost rekenkracht: ruim genoeg om een paar keer opnieuw te fotograferen
    await enforceRateLimit({
      name: "document-lezen",
      identifier: principal.userId,
      limit: 20,
      windowSeconds: 3600,
      message: "Je hebt je document vaak laten lezen. Probeer het over een uur opnieuw, of verstuur de verificatie gewoon: dan kijken wij mee.",
    });

    const form = await request.formData().catch(() => {
      throw AppError.validation("Verstuur de foto als multipart/form-data");
    });
    const foto = form.get("foto");
    if (!(foto instanceof File) || foto.size === 0) throw AppError.validation("Kies een foto van je document.");
    if (foto.size > MAX_BYTES) throw AppError.validation("De foto is te groot (max 12 MB).");
    if (!TOEGESTAAN.has(foto.type.toLowerCase())) throw AppError.validation("Gebruik een JPG-, PNG- of WebP-foto.");

    const gelezen = await leesMrzVanFoto(Buffer.from(await foto.arrayBuffer()));
    return NextResponse.json({ ...voorScherm(gelezen.uitslag), ms: gelezen.ms }, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    // nooit de inhoud loggen: alleen dat het misging
    if (status >= 500) logger.error("document lezen mislukt", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
