import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { leesMrzVanFoto, voorScherm } from "@/lib/kyc/mrz-lezen";
import { bewaarMrzVoorChip } from "@/lib/kyc/chip/sessie";
import { appKanChipLezen } from "@/lib/app-mode";

// ---------------------------------------------------------------------------
// POST /api/onboarding/document-lezen — leest vóór het versturen de MRZ van één
// foto (achterkant ID-kaart of pasfotopagina paspoort) en laat zien wat er
// gelezen is: nummer, vervaldatum, naam, en of de controlecijfers kloppen. Zo
// weet de werker meteen of de foto goed is, in plaats van een vage afwijzing
// achteraf. Niets gelogd (de MRZ bevat het BSN). Op de website wordt niets
// bewaard. Alleen in de Android-app die de chip kan lezen (cookie zf_app_chip)
// bewaren we de sleutel om de chip te openen (nummer, geboorte- en vervaldatum),
// verzegeld en hooguit 30 minuten (lib/kyc/chip/sessie.ts). Nooit foto, naam of BSN.
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
    if (!(foto instanceof File) || foto.size === 0) throw AppError.validation("Kies een foto van je document.").metSleutel("doc.kiesFoto");
    if (foto.size > MAX_BYTES) throw AppError.validation("De foto is te groot (max 12 MB).").metSleutel("doc.tegroot");
    if (!TOEGESTAAN.has(foto.type.toLowerCase())) throw AppError.validation("Gebruik een JPG-, PNG- of WebP-foto.").metSleutel("doc.formaat");

    const gelezen = await leesMrzVanFoto(Buffer.from(await foto.arrayBuffer()));
    // goed gelezen in de chip-app: verzegeld bewaren als sleutel om de chip te openen (lib/kyc/chip/sessie.ts)
    if (gelezen.uitslag?.geldig && appKanChipLezen(request.headers.get("cookie"))) {
      await bewaarMrzVoorChip(principal.userId, gelezen.uitslag).catch(() => undefined);
    }
    return NextResponse.json({ ...voorScherm(gelezen.uitslag), ms: gelezen.ms }, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    // nooit de inhoud loggen: alleen dat het misging
    if (status >= 500) logger.error("document lezen mislukt", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
