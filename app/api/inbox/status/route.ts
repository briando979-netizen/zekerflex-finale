import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { deleteUpload, storeUpload } from "@/lib/storage/local";
import { cleanPhoto } from "@/lib/messaging/media";
import { plaatsStatus, statusFeed } from "@/lib/messaging/status";
import { STATUS_FOTO_MAX_BYTES, STATUS_FOTO_TYPES, STATUS_KLEUREN, STATUS_MAX_PER_PERSOON, STATUS_TEKST_MAX } from "@/lib/messaging/status-vorm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Status in de chat (lib/messaging/status.ts), zoals in WhatsApp, 24 uur zichtbaar voor je contacten.
//   GET                                  → { mijn, anderen, namen } (wat jij mag zien)
//   POST { tekst, kleur }                → een tekststatus
//   POST multipart { file, tekst? }      → een fotostatus; opnieuw opgeslagen zonder GPS en andere gegevens (cleanPhoto)

const tekstSchema = z.object({ tekst: z.string().trim().min(1).max(STATUS_TEKST_MAX), kleur: z.number().int().min(0).max(STATUS_KLEUREN.length - 1) });

export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json(await statusFeed(p.userId));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const teVeel = () => AppError.validation(`Je hebt al ${STATUS_MAX_PER_PERSOON} statussen staan. Haal er eerst een weg.`);
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData().catch(() => null);
      const file = form?.get("file");
      if (!(file instanceof File)) throw AppError.validation("Kies een foto.");
      if (!(STATUS_FOTO_TYPES as readonly string[]).includes(file.type)) throw AppError.validation("Kies een JPG-, PNG- of WebP-foto.");
      if (file.size === 0 || file.size > STATUS_FOTO_MAX_BYTES) throw AppError.validation("De foto mag hooguit 10 MB zijn.");
      const tekst = String(form?.get("tekst") ?? "").trim().slice(0, STATUS_TEKST_MAX);
      // alleen een foto die we opnieuw konden opslaan: dan zit er geen GPS-plek of andere informatie meer in
      const schoon = await cleanPhoto(Buffer.from(await file.arrayBuffer()), file.type);
      if (!schoon) throw AppError.validation("Deze foto kunnen we niet lezen. Kies een andere.");
      let mediaId: string;
      try {
        mediaId = (await storeUpload({ filename: "status", mimeType: file.type, bytes: schoon, uploadedById: p.userId })).id;
      } catch (e) {
        logger.error("status foto opslaan mislukt", { error: (e as Error).message });
        throw AppError.upstream("Opslaan is mislukt. Probeer het later opnieuw.");
      }
      const s = await plaatsStatus(p.userId, { soort: "foto", mediaId, ...(tekst ? { tekst } : {}) });
      if (!s) {
        await deleteUpload(mediaId).catch(() => undefined);
        throw teVeel();
      }
      return NextResponse.json({ id: s.id }, { status: 201 });
    }
    const body = tekstSchema.safeParse(await req.json().catch(() => ({})));
    if (!body.success) throw AppError.validation("Typ een tekst voor je status.");
    const s = await plaatsStatus(p.userId, { soort: "tekst", tekst: body.data.tekst, kleur: body.data.kleur });
    if (!s) throw teVeel();
    return NextResponse.json({ id: s.id }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
