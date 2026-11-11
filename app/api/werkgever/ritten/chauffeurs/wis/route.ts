import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { leesJson } from "@/lib/afspraken/toegang";
import { wisChauffeur } from "@/lib/ritten/store";
import { eigenOrganisatie, foutAntwoord } from "@/lib/ritten/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/werkgever/ritten/chauffeurs/wis: { naam } haalt een chauffeur uit de lijst en vervangt zijn naam in alle ritten
 * door "Verwijderd". De ritten blijven bestaan. Het auditspoor krijgt alleen het aantal ritten, nooit de naam.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const o = await leesJson(request);
    const r = await wisChauffeur(tenantId, o.naam, new Date());
    await recordAudit({ category: "COMPANY", action: "rit.chauffeur-gewist", actorUserId: userId, actorLabel: "user", summary: `Naam van een chauffeur gewist uit ${r.ritten} ritten`, targetType: "tenant", targetId: tenantId });
    return NextResponse.json(r);
  } catch (err) {
    return foutAntwoord(err);
  }
}
