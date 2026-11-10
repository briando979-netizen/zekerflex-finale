import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { siteTenantOf } from "@/lib/sites/access";
import { kortingGebruikPerCode } from "@/lib/sites/korting-gebruik";
import { winkelSiteOf } from "@/lib/sites/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/sites/kortingen — Webshop → Kortingen: per kortingscode (id) hoe vaak hij gebruikt is,
// geteld bij het plaatsen van een bestelling (lib/sites/korting-gebruik.ts). De codes zelf staan in de winkel.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const site = await winkelSiteOf(await siteTenantOf(p));
    return NextResponse.json({ gebruik: site ? await kortingGebruikPerCode(site.id) : {} });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
