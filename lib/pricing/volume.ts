import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { tierFor, tierRateCents, type VolumeTier } from "@/lib/pricing/tiers";

// ---------------------------------------------------------------------------
// Staffelkorting on the employer platform fee: the more hours a client has
// worked through ZekerFlex this calendar month, the lower the fee per hour
// for the next ones. Tiers are by hours already approved this month, so a
// client always knows its rate up front and it never changes retroactively.
// The tiers themselves live in lib/pricing/tiers.ts (no db/env, browser-safe).
// ---------------------------------------------------------------------------

export { VOLUME_TIERS, tierFor, type VolumeTier } from "@/lib/pricing/tiers";

export function feePerHourFor(monthHours: number, baseCents = env.PLATFORM_FEE_PER_HOUR_CENTS): number {
  return tierRateCents(tierFor(monthHours).tier, baseCents);
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
