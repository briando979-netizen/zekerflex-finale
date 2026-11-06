import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { zoekPlekken } from "@/lib/geo/pdok";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/geo/search?q=  — adres zoeken via de PDOK Locatieserver (openbaar en
// gratis, geen sleutel). De aanroep zelf staat in lib/geo/pdok.ts: daar zitten
// de time-out en een kleine cache, zodat dezelfde zoekterm niet telkens opnieuw
// de deur uit gaat. Een storing geeft gewoon een lege lijst terug.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    const plekken = await zoekPlekken(q, 6);
    return NextResponse.json({
      results: plekken.map((p) => ({ label: p.naam, lat: p.lat, lng: p.lon })),
    });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
