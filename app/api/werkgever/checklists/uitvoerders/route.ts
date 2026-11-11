import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { schoneTekst } from "@/lib/checklists/model";
import { uitvoerderNamen, wisUitvoerder } from "@/lib/checklists/store";
import { eigenOrganisatie, foutAntwoord, leesJson } from "@/lib/checklists/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/werkgever/checklists/uitvoerders: de namen die in de uitvoeringen staan, met hoe vaak. */
export async function GET(): Promise<NextResponse> {
  try {
    const { tenantId } = await eigenOrganisatie();
    return NextResponse.json({ uitvoerders: await uitvoerderNamen(tenantId) });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/**
 * DELETE /api/werkgever/checklists/uitvoerders: de gegevens van een uitvoerder wissen (recht op vergetelheid). De naam
 * wordt in alle uitvoeringen "Verwijderd"; de uitvoeringen zelf blijven. De naam komt niet in het auditspoor.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    await enforceRateLimit({ name: "checklists-wissen", identifier: userId, limit: 30, windowSeconds: 3600 });
    const naam = schoneTekst((await leesJson(request)).naam, 60);
    if (naam.length < 2) throw AppError.validation("Kies de naam van de uitvoerder die je wilt wissen.");
    const aantal = await wisUitvoerder(tenantId, naam);
    await recordAudit({ category: "COMPANY", action: "checklists.wissen", actorUserId: userId, actorLabel: "user", summary: `Gegevens van een uitvoerder gewist (${aantal} uitvoeringen)`, targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ gewist: aantal });
  } catch (err) {
    return foutAntwoord(err);
  }
}
