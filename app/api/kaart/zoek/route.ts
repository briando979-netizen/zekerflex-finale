import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { leesPdokResultaten, type ZoekResultaat } from "@/lib/kaart/geo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Adres zoeken voor ZekerFlex Kaart via de PDOK Locatieserver (open data van de
// overheid: adressen, straten, plaatsen, postcodes). Via onze eigen server, zodat
// bezoekers niet rechtstreeks met een derde praten en de CSP dicht blijft.
// Kort bewaard per zoekterm.

const PDOK = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

type Bewaard = { tot: number; resultaten: ZoekResultaat[] };
function cache(): Map<string, Bewaard> {
  const g = globalThis as typeof globalThis & { __zfKaartZoek?: Map<string, Bewaard> };
  g.__zfKaartZoek ??= new Map();
  return g.__zfKaartZoek;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 120);
    if (q.length < 2) return NextResponse.json({ resultaten: [] });
    await enforceRateLimit({ name: "kaart-zoek", identifier: clientIp(request), limit: 120, windowSeconds: 600 });
    const sleutel = q.toLowerCase();
    const bewaard = cache().get(sleutel);
    if (bewaard && bewaard.tot > Date.now()) return NextResponse.json({ resultaten: bewaard.resultaten });

    const url = `${PDOK}?q=${encodeURIComponent(q)}&rows=8&fl=${encodeURIComponent("weergavenaam,type,centroide_ll")}&fq=${encodeURIComponent("type:(adres OR weg OR woonplaats OR postcode OR gemeente)")}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
    if (!res.ok) return NextResponse.json({ resultaten: [], fout: "Zoeken lukt even niet." }, { status: 502 });
    const resultaten = leesPdokResultaten(await res.json());
    if (cache().size > 2000) cache().clear();
    cache().set(sleutel, { tot: Date.now() + 10 * 60_000, resultaten });
    return NextResponse.json({ resultaten });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
