import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { leesJson } from "@/lib/afspraken/toegang";
import { bewaarChauffeurs, leesChauffeurs } from "@/lib/ritten/store";
import { eigenOrganisatie, foutAntwoord } from "@/lib/ritten/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/werkgever/ritten/chauffeurs: de namen van de chauffeurs van het bedrijf. */
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    return NextResponse.json({ chauffeurs: await leesChauffeurs(tenantId) }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** PUT /api/werkgever/ritten/chauffeurs: { namen } de lijst namen vervangen (vrije namen, geen accounts, hooguit 50). */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "ritten-schrijven", identifier: userId, limit: 600, windowSeconds: 3600 });
    return NextResponse.json({ chauffeurs: await bewaarChauffeurs(tenantId, await leesJson(request)) });
  } catch (err) {
    return foutAntwoord(err);
  }
}
