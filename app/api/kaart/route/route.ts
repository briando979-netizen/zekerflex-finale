import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { routeStatus, vraagRoute } from "@/lib/geo/route";
import { leesRouteVraag, type RouteModus } from "@/lib/geo/route-core";
import { schatTussenPunten } from "@/lib/geo/eigen-afstand";
import type { TravelMode } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De Route op ZekerFlex Kaart, via onze eigen routeplanner (lib/geo/route.ts):
//   GET                                   → { beschikbaar } (draait de routeplanner?)
//   POST { van: {lat, lon}, naar: {lat, lon}, modus: "auto" | "fiets" | "lopen" }
//     → 200 { route: { meters, seconds, lijn, stappen } }
//     → 200 { route: null, fout }         er is tussen deze punten geen weg
//     → 503 { fout, schatting }           de routeplanner is er even niet; onze eigen schatting erbij
// Openbaar (valt onder /api/kaart), IP-begrensd, alleen binnen Nederland. POST,
// zodat de plek van een bezoeker niet in een adresregel (en dus in een log) staat.
// Er wordt niets bewaard.

const WIJZE: Record<RouteModus, TravelMode> = { auto: "DRIVING", fiets: "BICYCLING", lopen: "WALKING" };
const GEEN_CACHE = { "Cache-Control": "no-store" };

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ beschikbaar: await routeStatus() }, { headers: GEEN_CACHE });
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "kaart-route", identifier: clientIp(request), limit: 120, windowSeconds: 600 });
    const vraag = leesRouteVraag(await request.json().catch(() => null));
    if (!vraag.ok) return NextResponse.json({ fout: vraag.fout }, { status: 422, headers: GEEN_CACHE });

    const uitkomst = await vraagRoute(vraag.van, vraag.naar, vraag.modus, { stappen: true });
    if (uitkomst.soort === "route") return NextResponse.json({ route: uitkomst.route }, { headers: GEEN_CACHE });
    if (uitkomst.soort === "geen") {
      return NextResponse.json(
        { route: null, fout: "Er is geen route gevonden tussen deze twee plekken. Kies een plek dichter bij een weg of pad." },
        { headers: GEEN_CACHE },
      );
    }
    const s = schatTussenPunten(
      { latitude: vraag.van.lat, longitude: vraag.van.lon },
      { latitude: vraag.naar.lat, longitude: vraag.naar.lon },
      WIJZE[vraag.modus],
    );
    return NextResponse.json(
      {
        fout: "De routeplanner is even niet beschikbaar. Hieronder staat onze schatting; probeer het straks opnieuw voor de route zelf.",
        schatting: { meters: s.distanceMeters, seconds: s.durationMinutes * 60 },
      },
      { status: 503, headers: { ...GEEN_CACHE, "Retry-After": "60" } },
    );
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
