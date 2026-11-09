import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { overdrachtGeldig } from "@/lib/kyc/overdracht";
import { leesMrzVanFoto, voorScherm } from "@/lib/kyc/mrz-lezen";

// POST /api/id-overdracht/lezen — de telefoon laat de code onderop het document
// lezen, net als /api/onboarding/document-lezen op de laptop. Openbaar met de
// eenmalige code (in het formulier, niet in het adres), IP-begrensd. Niets bewaard,
// niets gelogd (de MRZ bevat het BSN).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 12_000_000;
const TOEGESTAAN = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "id-overdracht-lezen", identifier: clientIp(request), limit: 20, windowSeconds: 3600 });
    const form = await request.formData().catch(() => {
      throw AppError.validation("Verstuur de foto als multipart/form-data");
    });
    const code = form.get("code");
    if (typeof code !== "string" || !(await overdrachtGeldig(code))) {
      throw AppError.notFound("Deze link is niet (meer) geldig. Maak op je laptop een nieuwe QR-code.");
    }
    const foto = form.get("foto");
    if (!(foto instanceof File) || foto.size === 0) throw AppError.validation("Kies een foto van je document.");
    if (foto.size > MAX_BYTES) throw AppError.validation("De foto is te groot (max 12 MB).");
    if (!TOEGESTAAN.has(foto.type.toLowerCase())) throw AppError.validation("Gebruik een JPG-, PNG- of WebP-foto.");
    const gelezen = await leesMrzVanFoto(Buffer.from(await foto.arrayBuffer()));
    return NextResponse.json({ ...voorScherm(gelezen.uitslag), ms: gelezen.ms }, { status: 200 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) logger.error("overdracht lezen mislukt", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
