import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Freelancer payout-speed choice. Postgres-backed (PayoutPreference) — this
// steers the display + the advisory fee shown at hours-approval; it never
// rewrites a Payment record.
//
// Previously stored on local disk (storage/payouts/prefs/<userId>.json) —
// unreliable on Vercel's serverless functions, whose filesystem is read-only
// outside /tmp.
// ---------------------------------------------------------------------------

export type PayoutSpeed = "instant" | "threeDay" | "standard";

export interface PayoutPrefs {
  speed: PayoutSpeed;
  updatedAt: string;
}

export const PAYOUT_SPEEDS: Record<
  PayoutSpeed,
  { label: string; sub: string; feeRate: number; withinDays: number }
> = {
  instant: {
    label: "Direct bij uren-goedkeuring",
    sub: "Zelfde werkdag op je rekening",
    feeRate: env.PAYOUT_INSTANT_FEE_RATE, // 4%
    withinDays: 0,
  },
  threeDay: {
    label: "Binnen 3 werkdagen",
    sub: "Iets goedkoper dan direct",
    feeRate: env.PAYOUT_3DAY_FEE_RATE, // 2%
    withinDays: 3,
  },
  standard: {
    label: "Wachten tot de opdrachtgever betaalt",
    sub: "Kosteloos — binnen 30 dagen",
    feeRate: 0,
    withinDays: 30,
  },
};

export const DEFAULT_PREFS: PayoutPrefs = { speed: "standard", updatedAt: new Date(0).toISOString() };

export async function getPayoutPrefs(userId: string): Promise<PayoutPrefs> {
  const row = await prisma.payoutPreference.findUnique({ where: { userId } });
  if (!row) return { ...DEFAULT_PREFS };
  const speed: PayoutSpeed = row.speed in PAYOUT_SPEEDS ? (row.speed as PayoutSpeed) : "standard";
  return { speed, updatedAt: row.updatedAt.toISOString() };
}

export async function setPayoutSpeed(userId: string, speed: PayoutSpeed): Promise<PayoutPrefs> {
  if (!(speed in PAYOUT_SPEEDS)) throw new Error("onbekende uitbetaalsnelheid");
  const row = await prisma.payoutPreference.upsert({
    where: { userId },
    create: { userId, speed },
    update: { speed },
  });
  return { speed: speed, updatedAt: row.updatedAt.toISOString() };
}

/** Fee withheld from a payout of `totalCents` at the given speed. */
export function payoutFee(totalCents: number, speed: PayoutSpeed): number {
  return Math.round(totalCents * (PAYOUT_SPEEDS[speed]?.feeRate ?? 0));
}
