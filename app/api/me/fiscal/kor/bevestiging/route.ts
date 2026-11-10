import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { storeDoc } from "@/lib/compliance/documents";
import { KOR_BEVESTIGING } from "@/lib/fiscal/kor";
import { alertOwnerLater } from "@/lib/ops/alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/fiscal/kor/bevestiging (multipart: file): de brief van de Belastingdienst dat de
// KOR geldt. Komt bij de documenten van de werker; een medewerker keurt hem goed en dan gaat de
// KOR aan (setDocStatus in lib/compliance/documents.ts).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    await enforceRateLimit({ name: "me-kor-bevestiging", identifier: p.userId, limit: 10, windowSeconds: 3600, message: "Te veel uploads. Probeer het later opnieuw." });
    const form = await request.formData().catch(() => {
      throw AppError.validation("Verwacht multipart/form-data");
    });
    const file = form.get("file");
    if (!(file instanceof File)) throw AppError.validation("Kies een bestand.");
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      const doc = await storeDoc(p.userId, "other", { filename: file.name || "kor-bevestiging", mimeType: file.type || "application/octet-stream", bytes, note: KOR_BEVESTIGING });
      alertOwnerLater({
        key: `kor-bevestiging:${p.userId}`,
        title: `KOR-bevestiging wacht op je: ${p.fullName}`,
        detail: "Bekijk de brief van de Belastingdienst bij Documenten en keur goed of af. Goedkeuren zet de KOR voor deze werker aan.",
        severity: "warning",
        url: `/admin/gebruikers/${p.userId}`,
      });
      return NextResponse.json({ doc }, { status: 201 });
    } catch (e) {
      if (e instanceof AppError) throw e;
      logger.error("kor bevestiging upload failed", { error: (e as Error).message });
      throw AppError.upstream("Uploaden is mislukt. Probeer het later opnieuw.");
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
