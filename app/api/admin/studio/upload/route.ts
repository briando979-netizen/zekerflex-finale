import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { MARKETING_PHOTOS, saveMarketingPhoto } from "@/lib/marketing/photos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLOTS = Object.keys(MARKETING_PHOTOS);
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_BYTES = 15_000_000;

// POST /api/admin/studio/upload  (multipart: slot, file)
// Filesystem only — writes a marketing image into /public/marketing. Does not
// touch the database, Redis or auth.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    requireRole(principal, "PLATFORM_ADMIN");

    const form = await request.formData().catch(() => {
      throw AppError.validation("Verstuur als multipart/form-data");
    });
    const slot = String(form.get("slot") ?? "");
    if (!SLOTS.includes(slot)) throw AppError.validation("Onbekende beeldplek");

    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw AppError.validation("Kies een afbeeldingsbestand");
    }
    if (!ALLOWED.has(file.type)) {
      throw AppError.validation("Alleen JPG, PNG, WebP of AVIF");
    }
    if (file.size > MAX_BYTES) {
      throw AppError.validation("Bestand te groot (max 15 MB)");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const url = await saveMarketingPhoto(slot as keyof typeof MARKETING_PHOTOS, bytes);
    return NextResponse.json({ ok: true, slot, ready: true, url });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
