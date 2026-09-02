import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Freelancer payout-speed choice. Filesystem, non-destructive — this steers the
// display + the advisory fee shown at hours-approval; it never rewrites a
// Payment record.
//   storage/payouts/prefs/<userId>.json
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

const dir = () => join(process.cwd(), "storage", "payouts", "prefs");
const file = (userId: string) => join(dir(), `${userId.replace(/[^a-z0-9-]/gi, "")}.json`);

export async function getPayoutPrefs(userId: string): Promise<PayoutPrefs> {
  const p = file(userId);
  if (!existsSync(p)) return { ...DEFAULT_PREFS };
  try {
    const raw = JSON.parse(await readFile(p, "utf8")) as Partial<PayoutPrefs>;
    const speed: PayoutSpeed =
      raw.speed && raw.speed in PAYOUT_SPEEDS ? (raw.speed as PayoutSpeed) : "standard";
    return { speed, updatedAt: raw.updatedAt ?? DEFAULT_PREFS.updatedAt };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function setPayoutSpeed(userId: string, speed: PayoutSpeed): Promise<PayoutPrefs> {
  if (!(speed in PAYOUT_SPEEDS)) throw new Error("onbekende uitbetaalsnelheid");
  const next: PayoutPrefs = { speed, updatedAt: new Date().toISOString() };
  await mkdir(dir(), { recursive: true });
  await writeFile(file(userId), JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** Fee withheld from a payout of `totalCents` at the given speed. */
export function payoutFee(totalCents: number, speed: PayoutSpeed): number {
  return Math.round(totalCents * (PAYOUT_SPEEDS[speed]?.feeRate ?? 0));
}
