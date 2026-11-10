import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { toErrorBody } from "@/lib/errors";
import { adresBijCoordinaat } from "@/lib/geo/pdok";
import { inNederland } from "@/lib/geo/thuisbasis-plek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/geo/reverse?lat=&lon=  — het dichtstbijzijnde adres bij een punt, via
// de PDOK Locatieserver (gratis, geen sleutel; time-out en cache staan in
// lib/geo/pdok.ts). Voor "Gebruik mijn huidige locatie" bij de thuisbasis: de
// postcode komt dan uit het adres. Geen adres in de buurt (of buiten Nederland)
// geeft { result: null }. De coördinaat komt nooit in een log.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({
      name: "geo-reverse",
      identifier: p.userId,
      limit: 30,
      windowSeconds: 600,
      message: "Te veel zoekopdrachten. Probeer het over een paar minuten opnieuw.",
    });
    const params = new URL(request.url).searchParams;
    const lat = Number(params.get("lat"));
    const lon = Number(params.get("lon"));
    if (!inNederland(lat, lon)) return NextResponse.json({ result: null, reden: "buiten-nl" });
    const plek = await adresBijCoordinaat(lat, lon);
    if (!plek) return NextResponse.json({ result: null, reden: "geen-adres" });
    return NextResponse.json({
      result: { label: plek.naam, lat: plek.lat, lng: plek.lon, postcode: plek.postcode, plaats: plek.plaats, soort: plek.soort },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
