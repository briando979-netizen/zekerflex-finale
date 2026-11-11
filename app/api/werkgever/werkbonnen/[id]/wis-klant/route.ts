import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { WERKBON_ID, totalen } from "@/lib/werkbonnen/model";
import { wisKlant } from "@/lib/werkbonnen/store";
import { eigenOrganisatie, foutAntwoord } from "@/lib/werkbonnen/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/werkgever/werkbonnen/<id>/wis-klant: naam, telefoon, e-mail en adres van de klant van deze werkbon wissen. De
 * werkbon blijft bestaan (omschrijving, uren, materialen); wat je zelf in omschrijving of notities schreef blijft staan.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const { id } = await ctx.params;
    if (!WERKBON_ID.test(id)) throw AppError.notFound("Deze werkbon bestaat niet (meer).");
    const bon = await wisKlant(tenantId, id, new Date());
    await recordAudit({ category: "COMPANY", action: "werkbon.klant-gewist", actorUserId: userId, actorLabel: "user", summary: `Klantgegevens van werkbon ${id} gewist`, targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ bon, totalen: totalen(bon) });
  } catch (err) {
    return foutAntwoord(err);
  }
}
