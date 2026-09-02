import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { storeUpload } from "@/lib/storage/local";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/uploads  (multipart/form-data, field "file")
// Stores the file on the box's own disk. PLATFORM_ADMIN (the chatbar "+").
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const form = await request.formData().catch(() => {
      throw AppError.validation("Verwacht multipart/form-data");
    });
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw AppError.validation("Veld 'file' ontbreekt");
    }
    const bytes = Buffer.from(await file.arrayBuffer());

    const stored = await storeUpload({
      filename: file.name || "bestand",
      mimeType: file.type || "application/octet-stream",
      bytes,
      uploadedById: principal.userId,
    });

    await recordAudit({
      category: "ADMIN",
      action: "upload.stored",
      actorUserId: principal.userId,
      actorLabel: "user",
      summary: `Bestand lokaal opgeslagen: ${stored.filename} (${stored.sizeBytes} bytes)`,
      targetType: "upload",
      targetId: stored.id,
    });

    return NextResponse.json({ upload: stored }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
