import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { leesJson } from "@/lib/afspraken/toegang";
import { VOERTUIG_ID } from "@/lib/ritten/model";
import { bewerkVoertuig, leesVoertuigen, maakVoertuig, zetVoertuigArchief } from "@/lib/ritten/store";
import { eigenOrganisatie, foutAntwoord } from "@/lib/ritten/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function voertuigId(v: unknown): string {
  if (typeof v !== "string" || !VOERTUIG_ID.test(v)) throw AppError.notFound("Dit voertuig bestaat niet (meer).");
  return v;
}

/** GET /api/werkgever/ritten/voertuigen: alle voertuigen (ook gearchiveerde, met een vlag). */
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    return NextResponse.json({ voertuigen: await leesVoertuigen(tenantId) }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** POST /api/werkgever/ritten/voertuigen: een voertuig toevoegen (kenteken uniek per organisatie). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "ritten-schrijven", identifier: userId, limit: 600, windowSeconds: 3600 });
    return NextResponse.json({ voertuig: await maakVoertuig(tenantId, await leesJson(request), new Date()) }, { status: 201 });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** PUT /api/werkgever/ritten/voertuigen: { id, ...velden } de gegevens van een voertuig bewerken. */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "ritten-schrijven", identifier: userId, limit: 600, windowSeconds: 3600 });
    const o = await leesJson(request);
    return NextResponse.json({ voertuig: await bewerkVoertuig(tenantId, voertuigId(o.id), o, new Date()) });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** PATCH /api/werkgever/ritten/voertuigen: { id, gearchiveerd } een voertuig archiveren of terughalen. */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "ritten-schrijven", identifier: userId, limit: 600, windowSeconds: 3600 });
    const o = await leesJson(request);
    if (typeof o.gearchiveerd !== "boolean") throw AppError.validation("Geef aan of het voertuig gearchiveerd of teruggehaald wordt.");
    return NextResponse.json({ voertuig: await zetVoertuigArchief(tenantId, voertuigId(o.id), o.gearchiveerd, new Date()) });
  } catch (err) {
    return foutAntwoord(err);
  }
}
