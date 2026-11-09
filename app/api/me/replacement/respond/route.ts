import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toErrorBody, AppError } from "@/lib/errors";
import {
  addReplacementResponse,
  getOpenRequestForShift,
  withdrawReplacementResponse,
} from "@/lib/replacements/store";
import { findOverlappingShift, overlapMessageSelf } from "@/lib/shifts/worker-overlap";
import { isMatchEligibleWorker } from "@/lib/matching/geschikt";
import { eisWerkrecht } from "@/lib/werkrecht/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/me/replacement/respond { shiftId, note? }
// A verified freelancer offers to take over a shift whose holder asked for a
// replacement. No assignment is created — the original picks a responder later.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { shiftId, note } = z
      .object({ shiftId: z.string().min(1).max(64), note: z.string().trim().max(400).optional() })
      .parse(await request.json().catch(() => ({})));

    const profile = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      select: {
        id: true,
        kvkValid: true,
        vatValid: true,
        country: true,
        isBlacklisted: true,
        matchingBlockedUntil: true,
        user: { select: { kycStatus: true } },
      },
    });
    if (!profile) throw AppError.forbidden("Geen freelancer-profiel");
    if (profile.user.kycStatus !== "VERIFIED") {
      throw AppError.precondition("Je kunt pas een klus overnemen als je volledig geverifieerd bent.");
    }
    if (profile.isBlacklisted) throw AppError.forbidden("Je account kan momenteel geen diensten aannemen.");
    if (profile.matchingBlockedUntil && profile.matchingBlockedUntil.getTime() > Date.now()) {
      throw AppError.precondition("Matching is tijdelijk beperkt vanwege Wet DBA-signalen.");
    }

    const req = await getOpenRequestForShift(shiftId);
    if (!req) throw AppError.notFound("Voor deze dienst loopt geen vervangingsverzoek.");
    if (req.userId === principal.userId) throw AppError.validation("Dit is je eigen vervangingsverzoek.");
    if (new Date(req.startsAt).getTime() < Date.now()) {
      throw AppError.precondition("Deze dienst is al begonnen.");
    }

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      select: { startsAt: true, endsAt: true, viaUitzendbureau: true },
    });
    if (!shift) throw AppError.notFound("Deze dienst bestaat niet meer.");
    // Dezelfde regel als de matching (lib/matching/geschikt.ts): een klus via het
    // uitzendbureau alleen voor een uitzendkracht; een gewone klus voor een zzp'er
    // met een geldige inschrijving of een uitzendkracht.
    if (!(await isMatchEligibleWorker({ userId: principal.userId, ...profile }, shift.viaUitzendbureau))) {
      throw AppError.precondition(
        shift.viaUitzendbureau
          ? "Deze klus loopt via het uitzendbureau: alleen een uitzendkracht kan hem overnemen."
          : "Je kunt pas een klus overnemen als je volledig geverifieerd bent.",
      );
    }
    // en het recht om in Nederland te werken (lib/werkrecht), zoals bij reageren en aannemen
    await eisWerkrecht(principal.userId);

    const clash = await prisma.shiftAssignment.findUnique({
      where: { shiftId_freelancerId: { shiftId, freelancerId: profile.id } },
      select: { cancelledAt: true },
    });
    if (clash && !clash.cancelledAt) {
      throw AppError.conflict("Je staat al op deze dienst ingepland.");
    }
    const overlap = await findOverlappingShift(prisma, profile.id, { shiftId, startsAt: shift.startsAt, endsAt: shift.endsAt });
    if (overlap) throw AppError.conflict(overlapMessageSelf(overlap));

    const updated = await addReplacementResponse(shiftId, {
      userId: principal.userId,
      name: principal.fullName,
      ...(note ? { note } : {}),
    });
    return NextResponse.json({ ok: true, responses: updated?.responses.length ?? 0 });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/me/replacement/respond { shiftId } — take back your offer.
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const { shiftId } = z
      .object({ shiftId: z.string().min(1).max(64) })
      .parse(await request.json().catch(() => ({})));
    await withdrawReplacementResponse(shiftId, principal.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
