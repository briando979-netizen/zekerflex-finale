import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { categorieKeuzes, lijstBonnenEvenKijken } from "@/lib/boekhouding/scherm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/boekhouding/bonnen?administratieId=…: de bonnen die een mens moet nakijken (status "even kijken").
// Geeft nooit de uitgelezen tekst van een bon terug, alleen de velden die het scherm nodig heeft.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const administratieId = new URL(request.url).searchParams.get("administratieId")?.trim().slice(0, 64) || undefined;
  return NextResponse.json({ bonnen: await lijstBonnenEvenKijken(administratieId), categorieen: categorieKeuzes() });
});
