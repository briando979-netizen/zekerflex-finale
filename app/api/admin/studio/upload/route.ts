import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { MARKETING_PHOTOS, saveMarketingPhoto } from "@/lib/marketing/photos";
import { maakSiteFotoBlijvend } from "@/lib/ontwerp/fotos-store";
import { withAdminAccess } from "@/lib/auth/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SLOTS = Object.keys(MARKETING_PHOTOS);
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const MAX_BYTES = 15_000_000;

// POST /api/admin/studio/upload  (multipart: slot, file)
// Writes a marketing image into /public/marketing (immediate) and into the
// Site-ontwerper media library + photo choice (KV), so it survives a deploy.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
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
  const plek = slot as keyof typeof MARKETING_PHOTOS;
  const url = await saveMarketingPhoto(plek, bytes);
  // ook blijvend (overleeft een uitrol): Site-ontwerper → Media → Foto's van de site
  const blijvend = await maakSiteFotoBlijvend(plek, bytes, `Studio – ${MARKETING_PHOTOS[plek].plek}`);
  return NextResponse.json({ ok: true, slot, ready: true, url, blijvend });
});
