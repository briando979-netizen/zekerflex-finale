import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { leesJson } from "@/lib/afspraken/toegang";
import { STATUSSEN, controleerInvoer, isStatus, regelVan, totalen } from "@/lib/werkbonnen/model";
import { leesTeam, lijstBonnen, nieuwId, nieuweBon } from "@/lib/werkbonnen/store";
import { eigenOrganisatie, foutAntwoord } from "@/lib/werkbonnen/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/werkgever/werkbonnen?status=bezig&q=zoekterm: de werkbonnen als lijstregels (nieuwste eerst), het aantal per
 * status (zonder filter, voor de knoppen) en de medewerkerslijst van het bedrijf.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const q = new URL(request.url).searchParams;
    const status = q.get("status");
    if (status && !isStatus(status)) throw AppError.validation("Kies een status uit de lijst.");
    const [alle, gefilterd, team] = await Promise.all([
      lijstBonnen(tenantId),
      lijstBonnen(tenantId, { ...(status && isStatus(status) ? { status } : {}), q: q.get("q") ?? "" }),
      leesTeam(tenantId),
    ]);
    const aantallen = Object.fromEntries(STATUSSEN.map((s) => [s, alle.filter((b) => b.status === s).length]));
    return NextResponse.json({ bonnen: gefilterd.map(regelVan), aantallen, totaal: alle.length, team });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** POST /api/werkgever/werkbonnen: een nieuwe werkbon maken (status nieuw, met het eerstvolgende nummer van dit jaar). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "werkbonnen-schrijven", identifier: userId, limit: 600, windowSeconds: 3600 });
    const r = controleerInvoer(await leesJson(request), nieuwId);
    if (!r.ok) throw AppError.validation(r.fout);
    const bon = await nieuweBon(tenantId, r.waarde, new Date());
    return NextResponse.json({ bon, totalen: totalen(bon) }, { status: 201 });
  } catch (err) {
    return foutAntwoord(err);
  }
}
