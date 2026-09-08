import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Hit {
  label: string;
  lat: number;
  lng: number;
}

function parsePoint(wkt: string | undefined): { lat: number; lng: number } | null {
  const m = wkt?.match(/POINT\(([-\d.]+)\s+([-\d.]+)\)/);
  return m ? { lng: Number(m[1]), lat: Number(m[2]) } : null;
}

// GET /api/geo/search?q=  — free-text location autocomplete via PDOK Locatieserver.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requirePrincipal();
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2) return NextResponse.json({ results: [] });

    const url = new URL("https://api.pdok.nl/bzk/locatieserver/search/v3_1/free");
    url.searchParams.set("q", q);
    url.searchParams.set("fq", "type:(adres OR weg OR postcode OR woonplaats)");
    url.searchParams.set("rows", "6");
    url.searchParams.set("fl", "weergavenaam,centroide_ll");

    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return NextResponse.json({ results: [] });

    const json = (await res.json()) as {
      response?: { docs?: { weergavenaam?: string; centroide_ll?: string }[] };
    };
    const results: Hit[] = [];
    for (const doc of json.response?.docs ?? []) {
      const p = parsePoint(doc.centroide_ll);
      if (p && doc.weergavenaam) results.push({ label: doc.weergavenaam, lat: p.lat, lng: p.lng });
    }
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
