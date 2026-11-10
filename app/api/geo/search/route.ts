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
    // ?soort=adres: alleen adressen (met postcode), voor de thuisbasis van een werker
    const alleenAdressen = new URL(request.url).searchParams.get("soort") === "adres";
    const plekken = await zoekPlekken(q, 6, { alleenAdressen });
    return NextResponse.json({
      results: plekken.map((p) => ({ label: p.naam, lat: p.lat, lng: p.lon, postcode: p.postcode, plaats: p.plaats, soort: p.soort })),
    });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
