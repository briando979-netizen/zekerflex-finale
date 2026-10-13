import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { resolveShiftContact } from "@/lib/messaging/contacts";
import { offerEmployerClaim } from "@/lib/claims/store";
import { NO_SHOW_GRACE_MINUTES, NO_SHOW_RELIABILITY_PENALTY } from "@/lib/claims/policy";

// ---------------------------------------------------------------------------
// Finds shift assignments whose shift started more than NO_SHOW_GRACE_MINUTES
// ago, were never cancelled, and never got a check-in (no Timesheet at all,
// or a DRAFT one with no checkedInAt) — a genuine no-show. Offers the
// employer the same 50% claim option as a late cancellation, dents the
// freelancer's reliability score, and marks the assignment cancelled (with a
// distinct reason) so it stops showing as an active upcoming shift.
// ---------------------------------------------------------------------------

export interface NoShowSweepResult {
  checked: number;
  flagged: number;
}

export async function sweepNoShows(): Promise<NoShowSweepResult> {
  const cutoff = new Date(Date.now() - NO_SHOW_GRACE_MINUTES * 60_000);

  const candidates = await prisma.shiftAssignment.findMany({
    where: {
      cancelledAt: null,
      shift: { startsAt: { lt: cutoff } },
      OR: [{ timesheet: null }, { timesheet: { actualStart: null } }],
    },
    select: {
      id: true,
      freelancerId: true,
      freelancer: { select: { userId: true, user: { select: { fullName: true } } } },
      shift: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          breakMinutes: true,
          hourlyRateCents: true,
          branch: { select: { name: true, tenantId: true } },
        },
      },
      timesheet: { select: { id: true } },
    },
    take: 200,
  });

  let flagged = 0;

  for (const a of candidates) {
    try {
      await prisma.$transaction(async (tx) => {
        if (a.timesheet) await tx.timesheet.delete({ where: { id: a.timesheet!.id } });
        await tx.shiftAssignment.update({
          where: { id: a.id },
          data: { cancelledAt: new Date(), cancelReason: "Niet opgekomen (no-show, automatisch gedetecteerd)" },
        });
        const current = await tx.freelancerProfile.findUnique({ where: { id: a.freelancerId }, select: { reliabilityScore: true } });
        await tx.freelancerProfile.update({
          where: { id: a.freelancerId },
          data: { reliabilityScore: Math.max(0, (current?.reliabilityScore ?? 1) - NO_SHOW_RELIABILITY_PENALTY) },
        });
      });

      const hours = Math.max(
        0,
        (a.shift.endsAt.getTime() - a.shift.startsAt.getTime()) / 3_600_000 - a.shift.breakMinutes / 60,
      );
      const seatValueCents = Math.round(hours * a.shift.hourlyRateCents);
      const contact = await resolveShiftContact(a.shift.id);

      await offerEmployerClaim({
        shiftId: a.shift.id,
        shiftTitle: a.shift.title,
        assignmentId: a.id,
        freelancerUserId: a.freelancer.userId,
        freelancerName: a.freelancer.user.fullName,
        freelancerProfileId: a.freelancerId,
        employerUserId: contact?.userId ?? null,
        employerTenantId: a.shift.branch.tenantId,
        branchName: a.shift.branch.name,
        shiftValueCents: seatValueCents,
        reason: "Niet opgekomen zonder afmelding.",
      });

      await recordAudit({
        category: "MATCHING",
        action: "shift.no_show_detected",
        actorLabel: "system",
        summary: `${a.freelancer.user.fullName} is niet opgekomen voor "${a.shift.title}" bij ${a.shift.branch.name}`,
        targetType: "shiftAssignment",
        targetId: a.id,
        metadata: { shiftId: a.shift.id, seatValueCents },
      });

      await sendMail({
        to: env.MAIL_ADMIN,
        subject: `No-show gedetecteerd — ${a.shift.title}`,
        kind: "replacement",
        text:
          `${a.freelancer.user.fullName} is niet opgekomen voor "${a.shift.title}" bij ${a.shift.branch.name} ` +
          `(begon ${a.shift.startsAt.toLocaleString("nl-NL")}), zonder afmelding. ` +
          `De opdrachtgever heeft een 50% claimoptie gekregen.`,
      }).catch(() => undefined);

      flagged += 1;
    } catch (err) {
      logger.warn("no-show sweep failed for one assignment (non-fatal)", {
        assignmentId: a.id,
        error: (err as Error).message,
      });
    }
  }

  return { checked: candidates.length, flagged };
}
