import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { sendMail, onboardingReminderEmail } from "@/lib/mail";
import { sendVerificationEmail } from "@/lib/auth/email-verify";
import { getFiscal } from "@/lib/fiscal/store";
import { heeftVestiging } from "@/lib/onboarding/employer";
import { herinneringReden, herinneringInhoud } from "@/lib/onboarding/voortgang";
import { werkerMist } from "@/lib/onboarding/herinnering-mist";
import { HERINNERING_TEKSTEN, werkerHerinnering } from "@/lib/onboarding/herinnering-teksten";
import { userLocale } from "@/lib/i18n/worker-locale";
import { isReservedTestAddress } from "@/lib/mail/test-adres";
import { leesEigenTest } from "@/lib/admin/eigen-test";
import { isEigenTestAccount } from "@/lib/admin/eigen-test-kern";

// ---------------------------------------------------------------------------
// Reminders for accounts that were created but never finished.
//
//  - e-mail address never confirmed → a fresh code mail (day 1 and 3)
//  - freelancer without verified identity / KVK-or-btw → "maak je account af"
//  - company without a first branch (address) / first klus → idem, per toestand
//    (lib/onboarding/voortgang.ts: herinneringReden). Nooit een herinnering om een KVK-nummer in
//    te vullen: die controle komt pas als het bedrijf iemand wil inplannen (lib/company/gecontroleerd.ts)
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
    // 12 nov: precies wat er mist (soort, branches, BSN, overeenkomst, btw/KOR, postcode, ID, foto), in de app-taal van de
    // werker, met per onderdeel een link. Lukt het opzoeken niet, dan de oude, algemene tekst hieronder (de herinnering mag niet wegblijven).
    const mist = await werkerMist(u.id).catch((err) => {
      logger.warn("onboarding reminder: mist niet op te zoeken", { userId: u.id, error: (err as Error).message });
      return null;
    });
    if (mist && mist.length === 0) return null;
    if (mist) {
      const taal = await userLocale(u.id);
      const h = werkerHerinnering(mist, HERINNERING_TEKSTEN[taal], u.fullName.split(" ")[0] || u.fullName, stap, taal);
      const kind = (await getFiscal(u.id).catch(() => null))?.workerKind === "uitzendkracht" ? "uitzendkracht" : "freelancer";
      return async () => {
        const result = await sendMail({ ...onboardingReminderEmail(u.fullName, kind, env.APP_BASE_URL, stap, undefined, h), to: u.email });
        // ook een push, in dezelfde taal en met dezelfde lijst; nooit voor een testadres, en een storing hier raakt de mail niet
        const verstuurd = !(result && typeof result === "object" && "sent" in result && result.sent === false);
        if (verstuurd && !isReservedTestAddress(u.email)) {
          const { sendLocalizedPush } = await import("@/lib/notifications/localized-push");
          await sendLocalizedPush([u.id], () => ({
            title: h.pushTitel,
            body: h.pushBody,
            data: { type: "onboarding", url: h.knopHref ?? h.items[0]?.href ?? "/dashboard/verificatie", tag: "onboarding-reminder" },
            ttlSeconds: 24 * 60 * 60,
          })).catch(() => 0);
        }
        return result;
      };
    }
    // eerlijk per toestand: alleen soort gekozen (geen profiel) of profiel zonder bevestigde identiteit
    const reden = herinneringReden({ rol: "werker", emailBevestigd: true, kycVerified: u.kycStatus === "VERIFIED", heeftProfiel: Boolean(u.freelancerProfile) });
    if (!reden || reden === "email") return null;
    const kind = (await getFiscal(u.id).catch(() => null))?.workerKind === "uitzendkracht" ? "uitzendkracht" : "freelancer";
    const inhoud = herinneringInhoud(reden);
    return () => sendMail({ ...onboardingReminderEmail(u.fullName, kind, env.APP_BASE_URL, stap, inhoud), to: u.email });
  }
  if (adminTenant) {
    // 23 nov 2026: geen herinnering om een KVK-nummer in te vullen; de controle komt pas bij het inplannen. Alleen het adres en
    // de eerste klus. Een bedrijf dat al een klus heeft (ook op een eenmalige locatie) hoort niets over het adres.
    const [vestiging, klus] = await Promise.all([
      heeftVestiging([adminTenant]),
      prisma.shift.findFirst({ where: { branch: { tenantId: adminTenant } }, select: { id: true } }),
    ]);
    const reden = herinneringReden({ rol: "bedrijf", emailBevestigd: true, adresKlaar: vestiging || Boolean(klus), heeftKlus: Boolean(klus) });
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

  // de privé-accounts van de eigenaar (lib/admin/eigen-test-regel.ts) krijgen geen herinneringen
  const eigenTest = await leesEigenTest();
  let sent = 0;
  for (const u of users) {
    try {
      const roles = u.memberships.map((m) => m.role);
      if (roles.some((r) => r === "PLATFORM_ADMIN" || r === "SALES")) continue;
      if (isEigenTestAccount(eigenTest, { userId: u.id, tenantIds: u.memberships.map((m) => m.tenantId) })) continue;
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
