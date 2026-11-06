import { NextResponse } from "next/server";
import { rijschoolVoorHost } from "@/lib/rijschool/domein";
import { fixedWindow } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/rijschool/domein?host=rijschooljansen.nl — welke rijschool bij een
// eigen domein hoort (lib/rijschool/domein.ts). De middleware vraagt dit voor
// verzoeken op een klantdomein en zet de paden om (lib/rijschool/domein-pad.ts).
// Openbaar en zonder geheimen: het domein wijst toch al naar die rijschool.
export async function GET(request: Request): Promise<NextResponse> {
  // elke vraag is een databasezoekopdracht: begrensd per adres (de middleware vraagt intern en onthoudt 60 s)
  const ip = clientIp(request);
  if (ip !== "local" && !(await fixedWindow(`rl:ip:rijschool-domein:${ip}`, 600, 60)).ok) {
    return NextResponse.json({ rijschool: null }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  const host = new URL(request.url).searchParams.get("host") ?? "";
  const r = await rijschoolVoorHost(host).catch(() => null);
  if (!r) return NextResponse.json({ rijschool: null }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ rijschool: { slug: r.slug, online: r.online, hoofd: r.hoofd } }, { headers: { "Cache-Control": "no-store" } });
}
