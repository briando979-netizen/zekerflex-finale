import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { sendMail, onboardingReminderEmail } from "@/lib/mail";
import { sendVerificationEmail } from "@/lib/auth/email-verify";
import { getFiscal } from "@/lib/fiscal/store";
import { isEmployerOnboarded } from "@/lib/onboarding/employer";
import { isTenantVerified } from "@/lib/company/verified";

// ---------------------------------------------------------------------------
// Reminders for accounts that were created but never finished.
//
//  - e-mail address never confirmed → a fresh code mail (day 1 and 3)
//  - freelancer without verified identity / KVK-or-btw → "maak je account af"
//  - company without KVK / first branch / verification   → idem
//
// Day 1, 3 and 7 after sign-up, one step per run (a user who signed up long
// ago gets one mail, not three at once), never more than three, and never
// for accounts older than 14 days. State in KV "onboarding-reminder:<userId>".
// Runs on the daily 09:00 job.
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
export const STAGE_DAYS = [1, 3, 7] as const;
const MAX_AGE_DAYS = 14;
const stateKey = (userId: string) => `onboarding-reminder:${userId}`;

/** Which reminder step is due for an account of this age (0 = none yet). */
export function dueStage(ageDays: number): number {
  let s = 0;
  for (const d of STAGE_DAYS) if (ageDays >= d) s++;
  return s;
}

export async function runOnboardingReminders(now = new Date()): Promise<{ checked: number; sent: number }> {
  const users = await prisma.user.findMany({
    where: {
      disabledAt: null,
      createdAt: { lte: new Date(now.getTime() - DAY), gte: new Date(now.getTime() - MAX_AGE_DAYS * DAY) },
    },
    select: {
      id: true,
      email: true,
      fullName: true,
      createdAt: true,
      emailVerifiedAt: true,
      kycStatus: true,
      freelancerProfile: { select: { id: true } },
      memberships: { select: { role: true, tenantId: true } },
    },
    take: 500,
  });

  let sent = 0;
  for (const u of users) {
    try {
      const roles = u.memberships.map((m) => m.role);
      if (roles.some((r) => r === "PLATFORM_ADMIN" || r === "SALES")) continue;
      const due = dueStage(Math.floor((now.getTime() - u.createdAt.getTime()) / DAY));
      const state = (await kvGet<{ stage: number }>(stateKey(u.id))) ?? { stage: 0 };
      if (due <= state.stage) continue;

      const freelancer = roles.includes("FREELANCER");
      const adminTenant = u.memberships.find((m) => m.role === "HQ_ADMIN")?.tenantId;
      let action: (() => Promise<unknown>) | null = null;

      if (!u.emailVerifiedAt) {
        // the code mail again (fresh code); after day 3 we stop chasing an unconfirmed address
        if (state.stage < 2) action = () => sendVerificationEmail(u.id, u.email, u.fullName);
      } else if (freelancer) {
        const done = u.kycStatus === "VERIFIED" && Boolean(u.freelancerProfile);
        if (!done) {
          const kind = (await getFiscal(u.id).catch(() => null))?.workerKind === "uitzendkracht" ? "uitzendkracht" : "freelancer";
          action = () => sendMail({ ...onboardingReminderEmail(u.fullName, kind, env.APP_BASE_URL, state.stage + 1), to: u.email });
        }
      } else if (adminTenant) {
        const done = (await isEmployerOnboarded([adminTenant])) && (await isTenantVerified(adminTenant));
        if (!done) action = () => sendMail({ ...onboardingReminderEmail(u.fullName, "bedrijf", env.APP_BASE_URL, state.stage + 1), to: u.email });
      }

      if (action) {
        await action();
        sent++;
      }
      // one step forward per run, also when nothing had to be sent (account already done)
      await kvSet(stateKey(u.id), { stage: Math.min(due, state.stage + 1), at: now.toISOString() });
    } catch (err) {
      logger.warn("onboarding reminder failed", { userId: u.id, error: (err as Error).message });
    }
  }
  logger.info("onboarding reminders", { checked: users.length, sent });
  return { checked: users.length, sent };
}
