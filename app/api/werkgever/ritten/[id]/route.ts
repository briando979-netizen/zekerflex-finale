import { NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { leesJson } from "@/lib/afspraken/toegang";
import { RIT_ID, isStatus, ritUren } from "@/lib/ritten/model";
import { leesRit, verwijderRit, wijzigRit, zetStatus } from "@/lib/ritten/store";
import { eigenOrganisatie, foutAntwoord } from "@/lib/ritten/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Een id uit de URL; alles wat geen rit-id is, is een rit die niet bestaat. */
async function ritId(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  if (!RIT_ID.test(id)) throw AppError.notFound("Deze rit bestaat niet (meer).");
  return id;
}

/** GET /api/werkgever/ritten/<id>: één rit met zijn duur in uren. */
export async function GET(_request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const rit = await leesRit(tenantId, await ritId(ctx));
    if (!rit) throw AppError.notFound("Deze rit bestaat niet (meer).");
    return NextResponse.json({ rit, uren: ritUren(rit) }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** PUT /api/werkgever/ritten/<id>: de velden van de rit vervangen (status en nummer blijven). */
export async function PUT(request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "ritten-schrijven", identifier: userId, limit: 600, windowSeconds: 3600 });
    const id = await ritId(ctx);
    const { rit, waarschuwingen } = await wijzigRit(tenantId, id, await leesJson(request), new Date());
    return NextResponse.json({ rit, uren: ritUren(rit), waarschuwingen });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** PATCH /api/werkgever/ritten/<id>: { status } de status wijzigen (alleen toegestane overgangen). */
export async function PATCH(request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "ritten-schrijven", identifier: userId, limit: 600, windowSeconds: 3600 });
    const id = await ritId(ctx);
    const o = await leesJson(request);
    if (!isStatus(o.status)) throw AppError.validation("Kies een status uit de lijst.");
    const { rit, waarschuwingen } = await zetStatus(tenantId, id, o.status, new Date());
    return NextResponse.json({ rit, uren: ritUren(rit), waarschuwingen });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** DELETE /api/werkgever/ritten/<id>: een rit verwijderen, alleen als hij gepland of geannuleerd is. */
export async function DELETE(_request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    await verwijderRit(tenantId, await ritId(ctx));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return foutAntwoord(err);
  }
}
