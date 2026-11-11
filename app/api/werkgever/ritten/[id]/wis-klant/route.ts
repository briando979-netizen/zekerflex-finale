import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { RIT_ID, ritUren } from "@/lib/ritten/model";
import { wisKlant } from "@/lib/ritten/store";
import { eigenOrganisatie, foutAntwoord } from "@/lib/ritten/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/werkgever/ritten/<id>/wis-klant: de naam van de klant en de adressen (van, naar, tussenstops) van deze rit
 * wissen. De rit blijft bestaan (tijden, voertuig, kilometers); wat je zelf in lading of opmerking schreef blijft staan.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const { id } = await ctx.params;
    if (!RIT_ID.test(id)) throw AppError.notFound("Deze rit bestaat niet (meer).");
    const rit = await wisKlant(tenantId, id, new Date());
    await recordAudit({ category: "COMPANY", action: "rit.klant-gewist", actorUserId: userId, actorLabel: "user", summary: `Klantgegevens van rit ${id} gewist`, targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ rit, uren: ritUren(rit) });
  } catch (err) {
    return foutAntwoord(err);
  }
}
