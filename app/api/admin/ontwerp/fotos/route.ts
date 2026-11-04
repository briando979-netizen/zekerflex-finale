import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { isPhotoReady, photoVersion } from "@/lib/marketing/photos";
import { MARKETING_PHOTOS, PHOTO_KEYS, isPhotoKey } from "@/lib/marketing/photo-specs";
import { mediaItem } from "@/lib/ontwerp/media";
import { getFotoKeuzes, zetFotoKeuze } from "@/lib/ontwerp/fotos-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function overzicht() {
  const keuzes = await getFotoKeuzes();
  return {
    plekken: PHOTO_KEYS.map((key) => ({
      key,
      plek: MARKETING_PHOTOS[key].plek,
      aspect: MARKETING_PHOTOS[key].aspect,
      standaardAlt: MARKETING_PHOTOS[key].alt,
      standaard: isPhotoReady(key) ? `/marketing/${MARKETING_PHOTOS[key].file}?v=${photoVersion(key)}` : null,
      keuze: keuzes[key] ?? null,
    })),
  };
}

// GET: de fotoplekken met hun standaardfoto en de gekozen vervanging.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await overzicht()));

const schema = z.object({ plek: z.string(), media: z.string(), alt: z.string().max(400).optional() });

// PUT: een foto uit de mediabibliotheek op een plek zetten (meteen live).
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isPhotoKey(parsed.data.plek)) throw AppError.validation("Deze fotoplek bestaat niet.");
  const item = await mediaItem(parsed.data.media);
  if (!item || item.soort !== "foto") throw AppError.validation("Kies een foto uit de mediabibliotheek.");
  await zetFotoKeuze(parsed.data.plek, { media: item.id, alt: parsed.data.alt ?? "" });
  await recordAudit({ category: "ADMIN", action: "ontwerp.foto", actorUserId: principal.userId, actorLabel: "user", summary: `Foto van de site vervangen: ${parsed.data.plek}` });
  return NextResponse.json(await overzicht());
});

// DELETE ?plek=…: terug naar de standaardfoto.
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const plek = new URL(request.url).searchParams.get("plek");
  if (!isPhotoKey(plek)) throw AppError.validation("Deze fotoplek bestaat niet.");
  await zetFotoKeuze(plek, null);
  await recordAudit({ category: "ADMIN", action: "ontwerp.foto", actorUserId: principal.userId, actorLabel: "user", summary: `Foto van de site terug naar de standaard: ${plek}` });
  return NextResponse.json(await overzicht());
});
