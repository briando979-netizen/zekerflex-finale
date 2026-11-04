import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { MAX_VIDEO_BYTES, mediaLijst, uploadMedia, verwijderMedia, zetAlt } from "@/lib/ontwerp/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET: de media-bibliotheek van de Site-ontwerper.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ media: await mediaLijst() });
});

// POST (multipart, veld "bestand"): een foto of video toevoegen.
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request) => {
  const lengte = Number(request.headers.get("content-length") ?? 0);
  if (lengte > MAX_VIDEO_BYTES + 1_000_000) throw AppError.validation("Dit bestand is te groot (meer dan 80 MB).");
  const form = await request.formData().catch(() => null);
  const bestand = form?.get("bestand");
  if (!bestand || typeof bestand === "string") throw AppError.validation("Kies een foto of video.");
  const item = await uploadMedia(Buffer.from(await bestand.arrayBuffer()), bestand.name);
  return NextResponse.json({ ok: true, item });
});

const wijziging = z.object({ id: z.string().regex(/^m[a-z0-9]{10,30}$/), alt: z.string().max(200), naam: z.string().max(80).optional() });

// PATCH: omschrijving (alt-tekst voor schermlezers en Google) of naam.
export const PATCH = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request) => {
  const parsed = wijziging.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Deze wijziging kon niet worden gelezen.");
  const item = await zetAlt(parsed.data.id, parsed.data.alt, parsed.data.naam);
  if (!item) throw AppError.validation("Dit bestand bestaat niet meer.");
  return NextResponse.json({ ok: true, item });
});

// DELETE ?id=…: weg uit de bibliotheek (een pagina die hem nog gebruikt toont dan niets op die plek).
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request) => {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^m[a-z0-9]{10,30}$/.test(id)) throw AppError.validation("Onbekend bestand.");
  await verwijderMedia(id);
  return NextResponse.json({ ok: true });
});
