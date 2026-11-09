import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { echteBronnen } from "@/lib/kvk/bronnen-echt";
import { schoonKvk } from "@/lib/kvk/normaliseer";
import { bedrijfDetails, zoekBedrijven } from "@/lib/kvk/zoek";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ q: z.string().trim().max(120) });

// GET /api/company/search?q=…            — bedrijven zoeken op naam, plaats of KVK-nummer
// GET /api/company/search?q=…&osm=1      — idem, en zoek ook in OpenStreetMap (alleen op verzoek)
// GET /api/company/search?kvk=12345678   — alle bekende gegevens (adres, btw) van één bedrijf
//
// Openbaar, voor het aanmeldformulier. Zoekt eerst in onze eigen bedrijvenindex
// (lib/kvk/), dan in KVKBase als de eigenaar dat toestaat, en alleen op
// verzoek in OpenStreetMap. Valt een bron weg, dan komt er een lege lijst: het
// formulier valt terug op zelf invullen. `configured` blijft true: de eigen
// index werkt ook zonder KVKBase-sleutel.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const params = new URL(request.url).searchParams;
    await enforceRateLimit({
      name: "company-search",
      identifier: clientIp(request),
      limit: 30,
      windowSeconds: 60,
      message: "Te veel zoekopdrachten — probeer het over een minuut opnieuw.",
    });

    const bronnen = echteBronnen();
    const kvkParam = params.get("kvk");
    if (kvkParam !== null) {
      const kvk = schoonKvk(kvkParam);
      if (!kvk) return NextResponse.json({ configured: true, results: [] });
      // details kunnen een betaalde opvraging en een OSM-aanvraag kosten: strakker begrensd
      await enforceRateLimit({
        name: "company-details",
        identifier: clientIp(request),
        limit: 12,
        windowSeconds: 60,
        message: "Te veel opzoekingen — probeer het over een minuut opnieuw.",
      });
      const treffer = await bedrijfDetails(kvk, bronnen);
      return NextResponse.json({ configured: true, results: treffer ? [treffer] : [] });
    }

    const parsed = schema.safeParse({ q: params.get("q") ?? "" });
    if (!parsed.success) return NextResponse.json({ configured: true, results: [] });

    const metOsm = params.get("osm") === "1";
    if (metOsm) {
      // OpenStreetMap vraagt hooguit één aanvraag per seconde en staat geen zoeken-tijdens-typen toe
      await enforceRateLimit({
        name: "company-osm",
        identifier: clientIp(request),
        limit: 6,
        windowSeconds: 60,
        message: "Te veel zoekopdrachten — probeer het over een minuut opnieuw.",
      });
    }
    const uitkomst = await zoekBedrijven(parsed.data.q, bronnen, { osm: metOsm });
    return NextResponse.json({
      configured: true,
      results: uitkomst.results,
      ...(uitkomst.bezet && uitkomst.results.length === 0 ? { bezet: true } : {}),
    });
  } catch (err) {
    const res = jsonError(err);
    if (res.status >= 500) logger.warn("public company search failed", { error: (err as Error).message });
    return res;
  }
}
