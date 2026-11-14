import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { belLijst } from "@/lib/sales/bellijst-server";
import { BEL_MIN_SCORE, NIET_BELOVEN, belScript } from "@/lib/sales/bellijst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/sales/bellijst — de leads die de eigenaar zelf kan bellen (lib/sales/bellijst.ts), met het belscript.
// Alleen PLATFORM_ADMIN. Wij bellen niemand: de lijst geeft alleen een tel:-link.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ regels: await belLijst(), script: belScript(), nietBeloven: NIET_BELOVEN, minScore: BEL_MIN_SCORE });
});
