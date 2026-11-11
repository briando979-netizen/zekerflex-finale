import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { leesJson } from "@/lib/afspraken/toegang";
import { controleerTeam } from "@/lib/werkbonnen/model";
import { bewaarTeam } from "@/lib/werkbonnen/store";
import { eigenOrganisatie, foutAntwoord } from "@/lib/werkbonnen/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT /api/werkgever/werkbonnen/team: de lijst met namen van medewerkers die je aan werkbonnen kunt geven (vrije namen, geen accounts). */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "werkbonnen-schrijven", identifier: userId, limit: 600, windowSeconds: 3600 });
    const r = controleerTeam(await leesJson(request));
    if (!r.ok) throw AppError.validation(r.fout);
    await bewaarTeam(tenantId, r.waarde);
    return NextResponse.json({ team: r.waarde });
  } catch (err) {
    return foutAntwoord(err);
  }
}
