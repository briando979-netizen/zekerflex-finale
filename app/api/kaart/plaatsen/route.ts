import { NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { zekerFlexPlaatsen } from "@/lib/kaart/plaatsen-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/kaart/plaatsen: de bedrijven van ZekerFlex met een openbare website, voor de kaart. Openbaar (valt onder
 * /api/kaart), IP-begrensd. Alleen naam, soort, adres, plek en de link naar de eigen site; geen contactgegevens.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "kaart-plaatsen", identifier: clientIp(request), limit: 60, windowSeconds: 600 });
    const plaatsen = await zekerFlexPlaatsen();
    return NextResponse.json({ plaatsen }, { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
