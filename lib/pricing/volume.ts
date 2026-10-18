import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Staffelkorting on the employer platform fee: the more hours a client has
// worked through ZekerFlex this calendar month, the lower the fee per hour
// for the next ones. Tiers are by hours already approved this month, so a
// client always knows its rate up front and it never changes retroactively.
// ---------------------------------------------------------------------------

export interface VolumeTier {
  name: string;
  fromHours: number;
  /** fraction of the base fee (1 = full price) */
  factor: number;
}

export const VOLUME_TIERS: VolumeTier[] = [
  { name: "Basis", fromHours: 0, factor: 1 },
  // Exact fractions of the € 3,50 base so the advertised round prices come out
  // to the cent (0.93 etc. gave € 3,26 / 3,01 / 2,77 / 2,49).
  { name: "Groei", fromHours: 500, factor: 325 / 350 }, // € 3,25
  { name: "Volume", fromHours: 2_000, factor: 300 / 350 }, // € 3,00
  { name: "Enterprise", fromHours: 10_000, factor: 275 / 350 }, // € 2,75
  { name: "Mega", fromHours: 50_000, factor: 250 / 350 }, // € 2,50
];

export function tierFor(monthHours: number): { tier: VolumeTier; next: VolumeTier | null } {
  let i = 0;
  while (i + 1 < VOLUME_TIERS.length && monthHours >= VOLUME_TIERS[i + 1]!.fromHours) i++;
  return { tier: VOLUME_TIERS[i]!, next: VOLUME_TIERS[i + 1] ?? null };
}

export function feePerHourFor(monthHours: number, baseCents = env.PLATFORM_FEE_PER_HOUR_CENTS): number {
  return Math.round(baseCents * tierFor(monthHours).tier.factor);
}

/** Hours approved at this client's locations since the start of the month. */
export async function monthHoursFor(tenantId: string, now = new Date()): Promise<number> {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const agg = await prisma.timesheet.aggregate({
    where: { branch: { tenantId }, status: { in: ["APPROVED", "PAID"] }, approvedAt: { gte: from } },
    _sum: { billableMinutes: true },
  });
  return Math.floor((agg._sum.billableMinutes ?? 0) / 60);
}

export interface VolumeStatus {
  monthHours: number;
  tier: VolumeTier;
  next: VolumeTier | null;
  feePerHourCents: number;
  baseFeePerHourCents: number;
  hoursToNext: number | null;
}

export async function volumeStatus(tenantId: string): Promise<VolumeStatus> {
  const monthHours = await monthHoursFor(tenantId);
  const { tier, next } = tierFor(monthHours);
  return {
    monthHours,
    tier,
    next,
    feePerHourCents: feePerHourFor(monthHours),
    baseFeePerHourCents: env.PLATFORM_FEE_PER_HOUR_CENTS,
    hoursToNext: next ? next.fromHours - monthHours : null,
  };
}
