import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { toErrorBody, AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { myOfferForShift } from "@/lib/offers/store";
import { buildCandidateCard } from "@/lib/employer/candidate-card";

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

    const card = await buildCandidateCard(userId);
    if (!card) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Profiel niet gevonden" } }, { status: 404 });
    return NextResponse.json({ card });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
