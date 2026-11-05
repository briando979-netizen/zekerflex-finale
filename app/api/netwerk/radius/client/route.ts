import { NextResponse } from "next/server";
import { isIP } from "node:net";
import { checkNetwerkToken } from "@/lib/netwerk/token";
import { radiusClientVoorIp } from "@/lib/netwerk/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// De RADIUS-server kent de wifi-apparatuur van klanten niet van tevoren. Komt
// er een verzoek van een onbekend IP, dan vraagt hij hier (dynamic clients)
// welk geheim erbij hoort. Alleen met NETWERK_RADIUS_TOKEN; het antwoord is
// in de attributen die FreeRADIUS daarvoor leest. Onbekend IP → 404.
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  const poort = checkNetwerkToken(request);
  if (!poort.ok) return NextResponse.json({ ok: false, reden: poort.message }, { status: poort.status });
  const ip = new URL(request.url).searchParams.get("ip") ?? "";
  if (!isIP(ip)) return NextResponse.json({ ok: false, reden: "geef ?ip=" }, { status: 400 });
  const c = await radiusClientVoorIp(ip);
  if (!c || !c.aan) return NextResponse.json({ ok: false, reden: "onbekend" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    "FreeRADIUS-Client-IP-Address": ip,
    "FreeRADIUS-Client-Secret": c.secret,
    "FreeRADIUS-Client-Shortname": `zf-${c.branchId}`,
    "FreeRADIUS-Client-NAS-Type": "other",
  });
}
