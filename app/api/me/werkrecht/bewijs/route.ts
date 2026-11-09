import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { landUit } from "@/lib/werkrecht/landen";
import { bewijsOpslaan, werkrechtOverzicht } from "@/lib/werkrecht/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/werkrecht/bewijs (multipart: land, file, geldigTot=yyyy-mm-dd):
// het document waaruit blijkt dat je in dat land mag werken. Een medewerker kijkt het na.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "me-werkrecht-bewijs", identifier: p.userId, limit: 10, windowSeconds: 600, message: "Te veel uploads. Probeer het over een paar minuten opnieuw." });
    const form = await request.formData().catch(() => {
      throw AppError.validation("Verwacht multipart/form-data");
    });
    const land = landUit(form.get("land"));
    if (!land) throw AppError.validation("Kies een land uit de lijst.");
    const file = form.get("file");
    if (!(file instanceof File)) throw AppError.validation("Kies een bestand.");
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      await bewijsOpslaan(p.userId, land, { filename: file.name || "document", bytes, geldigTot: form.get("geldigTot") });
    } catch (e) {
      // eigen controles (leeg, te groot, verkeerd type, datum) gaan zoals ze zijn; de rest nooit rauw naar buiten
      if (e instanceof AppError) throw e;
      logger.error("werkrecht upload failed", { error: (e as Error).message });
      throw AppError.upstream("Uploaden is mislukt. Probeer het later opnieuw.");
    }
    return NextResponse.json({ landen: await werkrechtOverzicht(p.userId) }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
