import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { SJABLOON_ID, controleerSjabloon } from "@/lib/checklists/model";
import { nieuwTaakId, wijzigSjabloon } from "@/lib/checklists/store";
import { eigenOrganisatie, foutAntwoord, leesJson, voorBeheer } from "@/lib/checklists/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PUT /api/werkgever/checklists/<id>: een checklist aanpassen (taken, volgorde, herhaling) of archiveren (actief: false). */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const { id } = await ctx.params;
    if (!SJABLOON_ID.test(id)) throw AppError.notFound("Deze checklist bestaat niet (meer).");
    await enforceRateLimit({ name: "checklists-sjabloon", identifier: userId, limit: 120, windowSeconds: 3600, message: "Je hebt vaak checklists aangepast. Probeer het over een uur opnieuw." });
    const r = controleerSjabloon(await leesJson(request), nieuwTaakId);
    if (!r.ok) throw AppError.validation(r.fout);
    const s = await wijzigSjabloon(tenantId, id, r.waarde);
    await recordAudit({ category: "COMPANY", action: "checklists.sjabloon", actorUserId: userId, actorLabel: "user", summary: s.actief ? "Checklist aangepast" : "Checklist gearchiveerd", targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ sjabloon: voorBeheer(s) });
  } catch (err) {
    return foutAntwoord(err);
  }
}
