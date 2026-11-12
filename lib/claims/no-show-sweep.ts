import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { sendLocalizedPush } from "@/lib/notifications/localized-push";
import { resolveShiftContact } from "@/lib/messaging/contacts";
import { offerEmployerClaim } from "@/lib/claims/store";
import { NO_SHOW_GRACE_MINUTES, NO_SHOW_RELIABILITY_PENALTY } from "@/lib/claims/policy";
import { plekVoorWerker } from "@/lib/shifts/place-label";

// ---------------------------------------------------------------------------
// Finds shift assignments whose shift started more than NO_SHOW_GRACE_MINUTES
// ago, were never cancelled, and never got a check-in (no Timesheet at all,
// or a DRAFT one with no checkedInAt) — a genuine no-show. Offers the
// employer the same 50% claim option as a late cancellation, dents the
// freelancer's reliability score, and marks the assignment cancelled (with a
// distinct reason) so it stops showing as an active upcoming shift.
//
// STAAT NIET IN DE CRON (12 nov 2026, gemeten): dat is een keuze van de eigenaar (Admin → Te doen, "no-show-sweep").
// Risico's: een check-in zonder bereik (lib/checkin/wachtrij.ts) komt pas later binnen, terwijl deze sweep na 60
// minuten al afzegt, het conceptbriefje wist, de opdrachtgever een claim aanbiedt en Beheer echt mailt. Grenzen die
// altijd gelden, ook als hij ooit aangaat:
//  - alleen diensten van de laatste NO_SHOW_MAX_DAGEN dagen (anders veegt de eerste run de hele geschiedenis);
//  - alleen geen urenbriefje of een CONCEPT zonder check-in: een ingediend, goedgekeurd of betaald urenbriefje (ook
//    zonder actualStart) raakt hij nooit;
//  - ?droog=1 op de route telt alleen, zonder iets te veranderen of te versturen.
// ---------------------------------------------------------------------------

export interface NoShowSweepResult {
  checked: number;
  flagged: number;
  /** alleen geteld, niets veranderd of verstuurd */
  droog?: boolean;
}

/** Oudere diensten laat de sweep altijd met rust. */
export const NO_SHOW_MAX_DAGEN = 7;

/** Welke toewijzingen als no-show gelden (puur, voor de sweep en de test). */
export function noShowKandidaatWaar(now: Date): Prisma.ShiftAssignmentWhereInput {
  const cutoff = new Date(now.getTime() - NO_SHOW_GRACE_MINUTES * 60_000);
  const ondergrens = new Date(now.getTime() - NO_SHOW_MAX_DAGEN * 86_400_000);
  return {
    cancelledAt: null,
    shift: { startsAt: { lt: cutoff, gte: ondergrens } },
    OR: [{ timesheet: null }, { timesheet: { actualStart: null, status: "DRAFT" } }],
  };
}

export async function sweepNoShows(opts: { droog?: boolean; now?: Date } = {}): Promise<NoShowSweepResult> {
  const now = opts.now ?? new Date();

  const candidates = await prisma.shiftAssignment.findMany({
    where: noShowKandidaatWaar(now),
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
          branch: { select: { name: true, tenantId: true, tenant: { select: { name: true } } } },
        },
      },
      timesheet: { select: { id: true } },
    },
    take: 200,
  });

  // droge telling: alleen het aantal, niets afzeggen, wissen, claimen, pushen of mailen
  if (opts.droog) {
    logger.info("no-show sweep droog geteld", { kandidaten: candidates.length });
    return { checked: candidates.length, flagged: 0, droog: true };
  }

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

      // Tell the worker straight away: "no check-in" can also mean "forgot to check in".
      await sendLocalizedPush([a.freelancer.userId], (t) => ({
        title: t.noShowTitle(a.shift.title),
        // bij een los adres de bedrijfsnaam, niet "Eenmalige locatie — adres" (lib/shifts/place-label.ts)
        body: t.noShowBody(a.shift.title, plekVoorWerker(a.shift.branch.name, a.shift.branch.tenant.name)),
        data: { type: "SHIFT", url: `/dashboard/klussen/${a.shift.id}`, tag: `noshow-${a.id}` },
        ttlSeconds: 86_400,
      })).catch(() => 0);

      await sendMail({
        to: env.MAIL_ADMIN,
        subject: `No-show gedetecteerd — ${a.shift.title}`,
        kind: "replacement",
        text:
          `${a.freelancer.user.fullName} is niet opgekomen voor "${a.shift.title}" bij ${a.shift.branch.name} ` +
          `(begon ${a.shift.startsAt.toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam" })}), zonder afmelding. ` +
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
