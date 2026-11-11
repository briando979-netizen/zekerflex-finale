import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { leesJson } from "@/lib/afspraken/toegang";
import { WERKBON_ID, controleerInvoer, isStatus, totalen } from "@/lib/werkbonnen/model";
import { leesBon, nieuwId, verwijderBon, wijzigBon, zetStatus } from "@/lib/werkbonnen/store";
import { eigenOrganisatie, foutAntwoord } from "@/lib/werkbonnen/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const geenBon = () => AppError.notFound("Deze werkbon bestaat niet (meer).");

/** GET /api/werkgever/werkbonnen/<id>: één werkbon met de totalen. */
export async function GET(_request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const { id } = await ctx.params;
    const bon = await leesBon(tenantId, id);
    if (!bon) throw geenBon();
    return NextResponse.json({ bon, totalen: totalen(bon) });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** PUT /api/werkgever/werkbonnen/<id>: de ingevulde velden opslaan (de status wijzig je met PATCH). */
export async function PUT(request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const { id } = await ctx.params;
    if (!WERKBON_ID.test(id)) throw geenBon();
    await enforceRateLimit({ name: "werkbonnen-schrijven", identifier: userId, limit: 600, windowSeconds: 3600 });
    const r = controleerInvoer(await leesJson(request), nieuwId);
    if (!r.ok) throw AppError.validation(r.fout);
    const bon = await wijzigBon(tenantId, id, r.waarde, new Date());
    return NextResponse.json({ bon, totalen: totalen(bon) });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** PATCH /api/werkgever/werkbonnen/<id>: de status zetten, met `zonderUren: true` om af te ronden zonder uren of materiaal. */
export async function PATCH(request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const { id } = await ctx.params;
    if (!WERKBON_ID.test(id)) throw geenBon();
    await enforceRateLimit({ name: "werkbonnen-schrijven", identifier: userId, limit: 600, windowSeconds: 3600 });
    const o = await leesJson(request);
    if (!isStatus(o.status)) throw AppError.validation("Kies een status uit de lijst.");
    const bon = await zetStatus(tenantId, id, o.status, { zonderUren: o.zonderUren === true });
    return NextResponse.json({ bon, totalen: totalen(bon) });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** DELETE /api/werkgever/werkbonnen/<id>: alleen een werkbon die nieuw of geannuleerd is. */
export async function DELETE(_request: Request, ctx: Ctx): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const { id } = await ctx.params;
    if (!WERKBON_ID.test(id)) throw geenBon();
    await verwijderBon(tenantId, id);
    await recordAudit({ category: "COMPANY", action: "werkbon.verwijderd", actorUserId: userId, actorLabel: "user", summary: `Werkbon ${id} verwijderd`, targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return foutAntwoord(err);
  }
}
