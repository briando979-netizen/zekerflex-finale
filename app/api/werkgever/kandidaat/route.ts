import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { myOfferForShift } from "@/lib/offers/store";
import { buildCandidateCard } from "@/lib/employer/candidate-card";
import { isFollowing } from "@/lib/worker/follows";
import { getEmployerRelations, type EmployerRelations } from "@/lib/employer/relations";
import { inplanningenBij } from "@/lib/employer/match";
import { contactZichtbaar, naamBekend } from "@/lib/employer/match-kern";
import { recordAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/werkgever/kandidaat?userId=..&shiftId=..
// De opdrachtgever mag de profielkaart van een freelancer alleen zien zodra die
// op een van zíjn klussen heeft gereageerd (of is gematcht/uitgekozen). We
// controleren dus: (1) de klus hoort bij de organisatie van de aanvrager, en
// (2) de freelancer heeft op díe klus een reactie/match/toewijzing.
export async function GET(request: Request): Promise<Response> {
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? "";
    const shiftId = searchParams.get("shiftId") ?? "";
    if (!userId || !shiftId) throw AppError.validation("userId en shiftId zijn verplicht");

    const scope = await resolveEmployerScope(principal);
    const shift = await prisma.shift.findUnique({ where: { id: shiftId }, select: { id: true, branchId: true, branch: { select: { tenantId: true } } } });
    if (!shift || !scope.tenantIds.includes(shift.branch.tenantId)) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Geen toegang tot deze klus" } }, { status: 403 });
    }
    if (scope.branchIds && !scope.branchIds.includes(shift.branchId)) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Geen toegang tot deze klus" } }, { status: 403 });
    }

    const profile = await prisma.freelancerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Freelancer niet gevonden" } }, { status: 404 });
    }

    // Alleen als de freelancer zelf heeft gereageerd (offer) of is toegewezen —
    // een enkel engine-match (zonder reactie) geeft nog geen inzage in het profiel.
    const [offer, assignCount] = await Promise.all([
      myOfferForShift(userId, shiftId).catch(() => null),
      prisma.shiftAssignment.count({ where: { shiftId, freelancerId: profile.id } }),
    ]);
    const reacted = Boolean(offer && offer.status !== "withdrawn") || assignCount > 0;
    if (!reacted) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: "Deze freelancer heeft (nog) niet op deze klus gereageerd" } }, { status: 403 });
    }

    // "De match" (23 nov 2026, lib/employer/match-kern.ts): de volledige naam zodra de werker ooit bij dit bedrijf is ingepland;
    // telefoon en e-mail alleen zolang hij is ingepland op een klus die nog loopt of hooguit 14 dagen geleden afliep. Wie alleen
    // reageerde blijft afgeschermd (tests/kluspagina-privacy.test.ts). De match komt uit de database, nooit uit het verzoek.
    const tenantId = shift.branch.tenantId;
    const nu = new Date();
    const [inplanningen, rel] = await Promise.all([
      inplanningenBij(tenantId, profile.id),
      getEmployerRelations(tenantId).catch((): EmployerRelations => ({ favorites: [], blocked: [] })),
    ]);
    const contact = contactZichtbaar(inplanningen, nu);

    const [card, followsYou] = await Promise.all([
      buildCandidateCard(userId, nu, { tenantId, naamBekend: naamBekend(inplanningen), contact }),
      isFollowing(userId, tenantId).catch(() => false),
    ]);
    if (!card) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Profiel niet gevonden" } }, { status: 404 });
    // Vastleggen dát een bedrijf de contactgegevens van een ingeplande kracht zag (wie, van wie, bij welke klus): nooit de
    // waarden zelf, niet hier en niet in een log.
    if (card.contact) {
      await recordAudit({
        category: "MATCHING",
        action: "worker.contact.shown",
        actorUserId: principal.userId,
        actorLabel: "user",
        summary: "Contactgegevens van een ingeplande kracht getoond aan het bedrijf",
        targetType: "user",
        targetId: userId,
        metadata: { shiftId, tenantId },
      });
    }
    return NextResponse.json({
      card: {
        ...card,
        followsYou,
        favoriet: rel.favorites.some((f) => f.userId === userId),
        geblokkeerd: rel.blocked.some((b) => b.userId === userId),
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
