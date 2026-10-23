import { MatchStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { ensureModelAgreement } from "@/lib/agreements/model-agreement";
import { isTenantVerified } from "@/lib/company/verified";
import { myOfferForShift } from "@/lib/offers/store";

// ---------------------------------------------------------------------------
// Een geaccepteerde reactie bij een GEVERIFIEERD bedrijf hoort een echte
// toewijzing te hebben (assignment + draft-timesheet + modelovereenkomst). Als
// die er — om wat voor reden dan ook — niet is, maken we 'm alsnog, zodat de
// klus volledig te beheren is (komst bevestigen, in agenda zetten, vervanging
// regelen, afzeggen). Idempotent. Doet bewust niets bij een niet-geverifieerd
// bedrijf: daar wordt met opzet niemand ingepland.
// ---------------------------------------------------------------------------

export async function healAcceptedOffer(userId: string, freelancerId: string, shiftId: string): Promise<string | null> {
  const existing = await prisma.shiftAssignment.findUnique({
    where: { shiftId_freelancerId: { shiftId, freelancerId } },
    select: { id: true, cancelledAt: true },
  });
  if (existing && !existing.cancelledAt) return existing.id;

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true,
      branchId: true,
      startsAt: true,
      endsAt: true,
      breakMinutes: true,
      hourlyRateCents: true,
      positions: true,
      title: true,
      branch: { select: { tenantId: true } },
      _count: { select: { assignments: { where: { cancelledAt: null } } } },
    },
  });
  if (!shift) return null;
  if (shift._count.assignments >= shift.positions) return null; // al vol
  if (!(await isTenantVerified(shift.branch.tenantId))) return null; // bewust niet inplannen

  const offer = await myOfferForShift(userId, shiftId);

  try {
    return await prisma.$transaction(async (tx) => {
      const assignment = existing
        ? await tx.shiftAssignment.update({
            where: { id: existing.id },
            data: { cancelledAt: null, cancelReason: null },
            select: { id: true },
          })
        : await tx.shiftAssignment.create({
            data: { shiftId, freelancerId, source: MatchStatus.ACCEPTED },
            select: { id: true },
          });

      const hasTs = await tx.timesheet.findUnique({ where: { assignmentId: assignment.id }, select: { id: true } });
      if (!hasTs) {
        await tx.timesheet.create({
          data: {
            assignmentId: assignment.id,
            freelancerId,
            branchId: shift.branchId,
            scheduledStart: shift.startsAt,
            scheduledEnd: shift.endsAt,
            breakMinutes: shift.breakMinutes,
            hourlyRateCents: shift.hourlyRateCents,
          },
        });
      }

      await ensureModelAgreement(tx, {
        freelancerId,
        tenantId: shift.branch.tenantId,
        branchId: shift.branchId,
        shiftId,
        assignmentId: assignment.id,
        hourlyRateCents: shift.hourlyRateCents,
        scopeDescription: shift.title,
        ...(offer ? { freelancerSignedAt: new Date(offer.at) } : {}),
        ...(offer?.respondedAt ? { clientSignedAt: new Date(offer.respondedAt) } : {}),
      });

      return assignment.id;
    });
  } catch (err) {
    logger.warn("healAcceptedOffer failed", { shiftId, error: (err as Error).message });
    return null;
  }
}
