import { NextResponse } from "next/server";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { POST as zoekAdresBuitenland } from "@/app/api/werkgever/adres-buitenland/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Het oude adres van POST /api/werkgever/adres-buitenland (28 nov 2026, toen alleen België): een tabblad dat vóór de uitrol
// openging, stuurt "Adres zoeken" nog hierheen, zonder land. Zelfde poort (sessie en rol), daarna dezelfde route; zonder land
// is het België. Mag weg zodra niemand hem meer gebruikt (de werkgeversapp vraagt nu alleen /api/werkgever/adres-buitenland).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    requireRole(await requirePrincipal(), "LOCAL_MANAGER", "HQ_ADMIN", "PLATFORM_ADMIN");
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
  return zoekAdresBuitenland(request);
}
