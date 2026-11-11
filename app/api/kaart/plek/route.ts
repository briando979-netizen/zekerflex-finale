import { NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { osmPlekBijPunt, osmUrenNaarRegels } from "@/lib/integrations/osm-plaatsen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Nederland, met een ruime rand: buiten dit vak vraagt de kaart niets op bij OpenStreetMap.
const NL = { zuid: 50.6, noord: 53.8, west: 3.0, oost: 7.5 };

/**
 * GET /api/kaart/plek?lat=…&lng=…&naam=…: openingstijden, telefoon, website en adres van het bedrijf waarop
 * iemand op de kaart tikt, uit OpenStreetMap (© OpenStreetMap-bijdragers, ODbL). Openbaar (valt onder /api/kaart),
 * IP-begrensd, alleen lezen. Er wordt niets over de bezoeker bewaard; wel houdt de server het antwoord een uur vast.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "kaart-plek", identifier: clientIp(request), limit: 40, windowSeconds: 600 });
    const q = new URL(request.url).searchParams;
    const lat = Number(q.get("lat"));
    const lng = Number(q.get("lng"));
    const naam = (q.get("naam") ?? "").slice(0, 120);
    const geldig = Number.isFinite(lat) && Number.isFinite(lng) && lat >= NL.zuid && lat <= NL.noord && lng >= NL.west && lng <= NL.oost && naam.trim().length >= 2;
    if (!geldig) return NextResponse.json({ plek: null });
    const p = await osmPlekBijPunt({ lat, lng, naam });
    const plek = p
      ? { naam: p.naam, soort: p.soort, adres: p.adres, telefoon: p.telefoon, website: p.website, uren: osmUrenNaarRegels(p.openingstijden), kaartUrl: p.kaartUrl }
      : null;
    return NextResponse.json({ plek }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
