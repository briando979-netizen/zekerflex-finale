import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { sendMail, onboardingReminderEmail } from "@/lib/mail";
import { sendVerificationEmail } from "@/lib/auth/email-verify";
import { getFiscal } from "@/lib/fiscal/store";
import { isEmployerOnboarded } from "@/lib/onboarding/employer";
import { tenantVerification } from "@/lib/company/verified";
import { herinneringReden, herinneringInhoud } from "@/lib/onboarding/voortgang";

// ---------------------------------------------------------------------------
// Reminders for accounts that were created but never finished.
//
//  - e-mail address never confirmed → a fresh code mail (day 1 and 3)
//  - freelancer without verified identity / KVK-or-btw → "maak je account af"
//  - company without KVK / first branch / verification / first klus → idem, per toestand
//    (lib/onboarding/voortgang.ts: herinneringReden); wacht ZekerFlex zelf op een
//    handmatige controle, dan krijgt het bedrijf géén herinnering (er valt niets te doen)
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

interface HerinneringState {
  stage: number;
  at?: string;
  /** Hoe vaak een beheerder er met de hand een stuurde (Admin → Onboarding); telt niet mee voor de dagen-planning. */
  handmatig?: number;
}

interface HerinneringUser {
  id: string;
  email: string;
  fullName: string;
  emailVerifiedAt: Date | null;
  kycStatus: string;
  freelancerProfile: { id: string } | null;
  memberships: { role: string; tenantId: string }[];
}

/**
 * Wat dit account nu als herinnering zou krijgen, of null als er niets te sturen is (account klaar,
 * of het adres is na dag 3 niet meer na te jagen). Gedeeld door de dagelijkse taak en de knop in Admin.
 */
async function herinneringActie(u: HerinneringUser, stage: number, handmatig = false): Promise<(() => Promise<unknown>) | null> {
  const freelancer = u.memberships.some((m) => m.role === "FREELANCER");
  const adminTenant = u.memberships.find((m) => m.role === "HQ_ADMIN")?.tenantId;
  const stap = Math.min(stage + 1, STAGE_DAYS.length);

  if (!u.emailVerifiedAt) {
    // the code mail again (fresh code); after day 3 we stop chasing an unconfirmed address
    if (stage < 2 || handmatig) return () => sendVerificationEmail(u.id, u.email, u.fullName);
    return null;
  }
  if (freelancer) {
    // eerlijk per toestand: alleen soort gekozen (geen profiel) of profiel zonder bevestigde identiteit
    const reden = herinneringReden({ rol: "werker", emailBevestigd: true, kycVerified: u.kycStatus === "VERIFIED", heeftProfiel: Boolean(u.freelancerProfile) });
    if (!reden || reden === "email") return null;
    const kind = (await getFiscal(u.id).catch(() => null))?.workerKind === "uitzendkracht" ? "uitzendkracht" : "freelancer";
    const inhoud = herinneringInhoud(reden);
    return () => sendMail({ ...onboardingReminderEmail(u.fullName, kind, env.APP_BASE_URL, stap, inhoud), to: u.email });
  }
  if (adminTenant) {
    const [bedrijfKlaar, verificatie, klus] = await Promise.all([
      isEmployerOnboarded([adminTenant]),
      tenantVerification(adminTenant),
      prisma.shift.findFirst({ where: { branch: { tenantId: adminTenant } }, select: { id: true } }),
    ]);
    const reden = herinneringReden({ rol: "bedrijf", emailBevestigd: true, bedrijfKlaar, verified: verificatie.verified, inControle: Boolean(verificatie.inControle), heeftKlus: Boolean(klus) });
    if (!reden || reden === "email") return null;
    const inhoud = herinneringInhoud(reden);
    return () => sendMail({ ...onboardingReminderEmail(u.fullName, "bedrijf", env.APP_BASE_URL, stap, inhoud), to: u.email });
  }
  return null;
}

/** Het aantal verstuurde herinneringen uit de bewaarde staat: de dagen-planning plus wat een beheerder er met de hand bij stuurde. */
export function herinneringenVerstuurd(state: { stage?: number; handmatig?: number } | null | undefined): number {
  return (state?.stage ?? 0) + (state?.handmatig ?? 0);
}

/** "Herinnering nu sturen" (Admin → Onboarding): één herinnering aan dit account, buiten de dagen-planning om. */
export async function stuurHerinneringNu(userId: string, now = new Date()): Promise<{ sent: boolean; reden?: string }> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      disabledAt: true,
      emailVerifiedAt: true,
      kycStatus: true,
      freelancerProfile: { select: { id: true } },
      memberships: { select: { role: true, tenantId: true } },
    },
  });
  if (!u) return { sent: false, reden: "Account niet gevonden." };
  if (u.disabledAt) return { sent: false, reden: "Dit account is geblokkeerd of verwijderd." };
  if (u.memberships.some((m) => m.role === "PLATFORM_ADMIN" || m.role === "SALES")) return { sent: false, reden: "Beheerders en sales krijgen geen herinneringen." };

  const state = (await kvGet<HerinneringState>(stateKey(u.id))) ?? { stage: 0 };
  const action = await herinneringActie(u, state.stage, true);
  if (!action) return { sent: false, reden: "Dit account heeft niets meer af te ronden." };
  const result = await action();
  if (result && typeof result === "object" && "sent" in result && result.sent === false) {
    return { sent: false, reden: "De vorige mail ging net weg. Probeer het over een minuut opnieuw." };
  }
  await kvSet(stateKey(u.id), { ...state, handmatig: (state.handmatig ?? 0) + 1, at: now.toISOString() });
  return { sent: true };
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
      const state = (await kvGet<HerinneringState>(stateKey(u.id))) ?? { stage: 0 };
      if (due <= state.stage) continue;

      const action = await herinneringActie(u, state.stage);
      if (action) {
        await action();
        sent++;
      }
      // one step forward per run, also when nothing had to be sent (account already done)
      await kvSet(stateKey(u.id), { ...state, stage: Math.min(due, state.stage + 1), at: now.toISOString() });
    } catch (err) {
      logger.warn("onboarding reminder failed", { userId: u.id, error: (err as Error).message });
    }
  }
  logger.info("onboarding reminders", { checked: users.length, sent });
  return { checked: users.length, sent };
}
