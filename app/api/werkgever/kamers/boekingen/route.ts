import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError, toErrorBody } from "@/lib/errors";
import { leesJson } from "@/lib/afspraken/toegang";
import { BOEKING_ID, isStatus } from "@/lib/kamers/model";
import { maakBoeking, schoonNaBewaartermijn, wijzigBoeking, wisGast, zetStatus } from "@/lib/kamers/store";
import { eigenOrganisatie } from "@/lib/kamers/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Een id uit het verzoek; alles wat geen boeking-id is, is een boeking die niet bestaat. */
function boekingId(v: unknown): string {
  if (typeof v !== "string" || !BOEKING_ID.test(v)) throw AppError.notFound("Deze boeking bestaat niet (meer).");
  return v;
}

/** POST /api/werkgever/kamers/boekingen: een boeking maken (invoer door het bedrijf zelf). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    const boeking = await maakBoeking(tenantId, await leesJson(request));
    return NextResponse.json({ boeking }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PATCH /api/werkgever/kamers/boekingen: { id, actie } met actie
 * - "bewerken": kamer, nachten, gast, personen, opmerking en eventuele totaalprijs
 * - "status": { status } (gereserveerd, ingecheckt, uitgecheckt, geannuleerd; uitchecken zet de kamer op vuil)
 * - "wis-gast": naam, telefoon, e-mail en opmerking wissen
 * - "opschonen": (zonder id) de gastgegevens wissen van alle boekingen langer dan twee jaar na vertrek
 */
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const o = await leesJson(request);
    if (o.actie === "opschonen") {
      const aantal = await schoonNaBewaartermijn(tenantId);
      if (aantal > 0) await recordAudit({ category: "COMPANY", action: "kamers.opgeschoond", actorUserId: userId, actorLabel: "user", summary: `Gastgegevens van ${aantal} oude boekingen gewist`, targetType: "tenant", targetId: tenantId });
      return NextResponse.json({ gewist: aantal });
    }
    const id = boekingId(o.id);
    switch (o.actie) {
      case "bewerken":
        return NextResponse.json({ boeking: await wijzigBoeking(tenantId, id, o) });
      case "status": {
        if (!isStatus(o.status)) throw AppError.validation("Onbekende status.");
        return NextResponse.json(await zetStatus(tenantId, id, o.status));
      }
      case "wis-gast": {
        const boeking = await wisGast(tenantId, id);
        await recordAudit({ category: "COMPANY", action: "kamers.gast-gewist", actorUserId: userId, actorLabel: "user", summary: "Gastgegevens van een boeking gewist", targetType: "tenant", targetId: tenantId });
        return NextResponse.json({ boeking });
      }
      default:
        throw AppError.validation("Onbekende actie.");
    }
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
