import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { SJABLOON_ID } from "@/lib/checklists/model";
import { maakLink, trekLinkIn } from "@/lib/checklists/store";
import { eigenOrganisatie, foutAntwoord, voorBeheer } from "@/lib/checklists/toegang";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/werkgever/checklists/<id>/link: een invullink maken voor personeel zonder account. De sleutel (in `pad`)
 * komt alleen nu terug: bewaard wordt een hash. Een eerdere link van dit sjabloon werkt daarna niet meer.
 */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const { id } = await ctx.params;
    if (!SJABLOON_ID.test(id)) throw AppError.notFound("Deze checklist bestaat niet (meer).");
    await enforceRateLimit({ name: "checklists-link", identifier: userId, limit: 30, windowSeconds: 3600, message: "Je hebt vaak een link gemaakt. Probeer het over een uur opnieuw." });
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
    const { sjabloon, sleutel } = await maakLink(tenantId, id, tenant?.name ?? "");
    await recordAudit({ category: "COMPANY", action: "checklists.link", actorUserId: userId, actorLabel: "user", summary: "Invullink van een checklist gemaakt", targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ sjabloon: voorBeheer(sjabloon), pad: `/checklist/${sleutel}` });
  } catch (err) {
    return foutAntwoord(err);
  }
}

/** DELETE /api/werkgever/checklists/<id>/link: de invullink intrekken; wie hem nog heeft, ziet daarna "bestaat niet". */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { tenantId, userId } = await eigenOrganisatie();
    const { id } = await ctx.params;
    if (!SJABLOON_ID.test(id)) throw AppError.notFound("Deze checklist bestaat niet (meer).");
    const sjabloon = await trekLinkIn(tenantId, id);
    await recordAudit({ category: "COMPANY", action: "checklists.link", actorUserId: userId, actorLabel: "user", summary: "Invullink van een checklist ingetrokken", targetType: "tenant", targetId: tenantId });
    return NextResponse.json({ sjabloon: voorBeheer(sjabloon) });
  } catch (err) {
    return foutAntwoord(err);
  }
}
