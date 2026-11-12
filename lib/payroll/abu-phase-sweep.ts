import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { abuFaseEmailT } from "@/lib/mail/werker/abu-fase";
import { mailTaalVoorWerker } from "@/lib/mail/taal";
import { getFiscal, invoiceModeFor } from "@/lib/fiscal/store";
import { getUitzendStatus } from "@/lib/payroll/uitzend-status";

// ---------------------------------------------------------------------------
// ABU-fase transition sweep. getUitzendStatus() recomputes the current phase
// (A/B/C) fresh from timesheets every time it's called — there was nowhere a
// *transition* (crossing from one phase into the next) was ever detected or
// announced, so FreelancerProfile.lastAbuPhase exists purely so this sweep
// has something to diff against.
//
// What this does NOT do: generate a new signed uitzendovereenkomst document.
// There is no existing uitzendovereenkomst contract-template/PDF system in
// this codebase to extend (ModelAgreement is the Wet DBA freelancer
// agreement — a different legal instrument for zzp'ers, unrelated to ABU
// phases). Building a real one is a separate, larger piece of work.
// ---------------------------------------------------------------------------

export interface AbuPhaseTransition {
  userId: string;
  name: string;
  from: string;
  to: string;
}

export interface AbuPhaseSweepResult {
  checked: number;
  seeded: number;
  transitions: AbuPhaseTransition[];
}

export async function sweepAbuPhaseTransitions(): Promise<AbuPhaseSweepResult> {
  const profiles = await prisma.freelancerProfile.findMany({
    where: { timesheets: { some: { status: { in: ["APPROVED", "PAID", "SUBMITTED"] } } } },
    select: { id: true, userId: true, lastAbuPhase: true, user: { select: { fullName: true, email: true } } },
  });

  let checked = 0;
  let seeded = 0;
  const transitions: AbuPhaseTransition[] = [];

  for (const p of profiles) {
    try {
      const fiscal = await getFiscal(p.userId);
      if (invoiceModeFor(fiscal) !== "payroll") continue; // only real uitzendkrachten have an ABU-fase
      checked += 1;

      const status = await getUitzendStatus(p.userId);
      if (!status) continue;

      if (!p.lastAbuPhase) {
        // First time we've ever checked this person — seed the baseline
        // silently. Without this, everyone already in phase B/C from before
        // this sweep existed would fire a false "transition" on day one.
        await prisma.freelancerProfile.update({
          where: { id: p.id },
          data: { lastAbuPhase: status.phase, lastAbuPhaseAt: new Date() },
        });
        seeded += 1;
        continue;
      }

      if (p.lastAbuPhase === status.phase) continue;

      const transition: AbuPhaseTransition = {
        userId: p.userId,
        name: p.user.fullName,
        from: p.lastAbuPhase,
        to: status.phase,
      };
      transitions.push(transition);

      await prisma.freelancerProfile.update({
        where: { id: p.id },
        data: { lastAbuPhase: status.phase, lastAbuPhaseAt: new Date() },
      });

      await recordAudit({
        category: "BILLING",
        action: "uitzend.abu_phase_transition",
        actorLabel: "system",
        summary: `${p.user.fullName} is overgegaan van ABU-fase ${transition.from} naar fase ${transition.to} (${status.weeksWorked} weken gewerkt).`,
        targetType: "freelancer",
        targetId: p.userId,
        metadata: { from: transition.from, to: transition.to, weeksWorked: status.weeksWorked, hoursWorked: status.hoursWorked },
      });

      if (p.user.email) {
        const mail = abuFaseEmailT({ fullName: p.user.fullName, van: transition.from, naar: transition.to, weken: status.weeksWorked }, await mailTaalVoorWerker(p.userId));
        await sendMail({ ...mail, to: p.user.email }).catch(() => undefined);
      }

      await sendMail({
        to: env.MAIL_ADMIN,
        subject: `ABU-fase overgang: ${p.user.fullName} (${transition.from} → ${transition.to})`,
        kind: "abu-fase-overgang",
        text:
          `${p.user.fullName} (userId ${p.userId}) is overgegaan van ABU-fase ${transition.from} naar fase ${transition.to}.\n\n` +
          `Gewerkte weken: ${status.weeksWorked}. Gewerkte uren: ${status.hoursWorked}.\n\n` +
          `Nieuwe fase-contract moet handmatig worden opgesteld en ondertekend — er is nog geen ` +
          `geautomatiseerde uitzendovereenkomst-generatie voor fase-overgangen.`,
      }).catch(() => undefined);
    } catch (err) {
      logger.warn("abu phase sweep failed for one freelancer (non-fatal)", {
        userId: p.userId,
        error: (err as Error).message,
      });
    }
  }

  return { checked, seeded, transitions };
}
