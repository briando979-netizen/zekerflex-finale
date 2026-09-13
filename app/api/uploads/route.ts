import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { storeUpload } from "@/lib/storage/local";
import { enforceRateLimit } from "@/lib/rate-limit";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/uploads  (multipart/form-data, field "file")
// Stores the file on the box's own disk. PLATFORM_ADMIN (the chatbar "+").
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  await enforceRateLimit({
    name: "uploads",
    identifier: principal.userId,
    limit: 30,
    windowSeconds: 600,
    message: "Te veel uploads — probeer het over enkele minuten opnieuw.",
  });

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
});
