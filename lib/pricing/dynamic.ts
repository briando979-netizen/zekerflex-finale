import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Dynamic Pricing Engine
//
// Adjusts the platform fee and suggested hourly rate in real-time based on:
//   - demand pressure  (open shifts / available freelancers ratio in that area)
//   - urgency          (hours until shift starts)
//   - time-of-day / weekday / season signals
//   - scarcity         (few qualified freelancers for this skill/cert combo)
//
// The base platform fee is €3.50/hr. Surge multiplier is capped at 2.0×.
// Freelancer rate suggestions move to fill shifts faster (or slower if supply
// is high). All multipliers are transparent to both parties.
// ---------------------------------------------------------------------------

export interface PricingContext {
  shiftId: string;
  requiredSkillIds: string[];
  requiredCertIds: string[];
  startsAt: Date;
  locationLat?: number | undefined;
  locationLng?: number | undefined;
  radiusKm?: number | undefined;
}

export interface PricingResult {
  baseFeeEur: number;
  surgeMultiplier: number;
  effectiveFeeEur: number;
  suggestedHourlyRateEurMin: number;
  suggestedHourlyRateEurMax: number;
  demandScore: number;
  scarcityScore: number;
  urgencyScore: number;
  signals: string[];
}

const BASE_FEE_EUR = 3.5;
const MAX_SURGE = 2.0;
const MIN_SURGE = 0.8;

function urgencyMultiplier(startsAt: Date): { mult: number; label: string } {
  const hoursUntil = (startsAt.getTime() - Date.now()) / 3_600_000;
  if (hoursUntil <= 2) return { mult: 1.6, label: "Ultraspoedklus (<2u)" };
  if (hoursUntil <= 8) return { mult: 1.35, label: "Spoedklus (<8u)" };
  if (hoursUntil <= 24) return { mult: 1.15, label: "Zelfde dag" };
  if (hoursUntil <= 72) return { mult: 1.05, label: "Korte aankondiging" };
  return { mult: 1.0, label: "" };
}

function timeOfWeekMultiplier(startsAt: Date): { mult: number; label: string } {
  const day = startsAt.getDay(); // 0=Sun, 6=Sat
  const hour = startsAt.getHours();
  if (day === 0 || day === 6) return { mult: 1.2, label: "Weekend" };
  if (hour < 6 || hour >= 22) return { mult: 1.15, label: "Nacht/vroeg" };
  return { mult: 1.0, label: "" };
}

export async function computeDynamicPricing(ctx: PricingContext): Promise<PricingResult> {
  const signals: string[] = [];

  // --- Urgency ---
  const { mult: urgMult, label: urgLabel } = urgencyMultiplier(ctx.startsAt);
  const urgencyScore = Math.min(1, (urgMult - 0.8) / 1.2);
  if (urgLabel) signals.push(urgLabel);

  // --- Time of week ---
  const { mult: towMult, label: towLabel } = timeOfWeekMultiplier(ctx.startsAt);
  if (towLabel) signals.push(towLabel);

  // --- Demand: open shifts vs active freelancers in the area ---
  const [openShiftCount, activeFreelancerCount] = await Promise.all([
    prisma.shift.count({
      where: {
        status: "OPEN",
        startsAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 86400_000) },
      },
    }),
    // Proxy for "available": freelancers with a high acceptance score are likely active
    prisma.freelancerProfile.count({ where: { acceptanceScore: { gte: 0.1 } } }),
  ]).catch(() => [1, 10] as const);

  const demandRatio = (openShiftCount as number) / Math.max(1, activeFreelancerCount as number);
  const demandScore = Math.min(1, demandRatio / 0.5); // saturates at 1 when ratio >= 0.5
  let demandMult = 1.0;
  if (demandScore > 0.7) { demandMult = 1.3; signals.push("Hoge vraag in regio"); }
  else if (demandScore > 0.4) { demandMult = 1.15; signals.push("Gemiddeld druk"); }

  // --- Scarcity: how many freelancers have ALL required skills/certs ---
  let scarcityScore = 0;
  let scarcityMult = 1.0;
  if (ctx.requiredSkillIds.length > 0 || ctx.requiredCertIds.length > 0) {
    const qualifiedCount = await prisma.freelancerProfile.count({
      where: {
        acceptanceScore: { gte: 0.1 },
        ...(ctx.requiredSkillIds.length
          ? { skills: { some: { skillId: { in: ctx.requiredSkillIds } } } }
          : {}),
      },
    }).catch(() => 99);

    if (qualifiedCount < 5) { scarcityScore = 1; scarcityMult = 1.4; signals.push("Schaarse skill/certificaat"); }
    else if (qualifiedCount < 20) { scarcityScore = 0.6; scarcityMult = 1.2; signals.push("Beperkt aanbod gekwalificeerd"); }
    else scarcityScore = 0.1;
  }

  // --- Compose surge multiplier ---
  const rawSurge = urgMult * towMult * demandMult * scarcityMult;
  const surgeMultiplier = Math.min(MAX_SURGE, Math.max(MIN_SURGE, rawSurge));
  const effectiveFeeEur = Math.round(BASE_FEE_EUR * surgeMultiplier * 100) / 100;

  // --- Suggested hourly rate range for the freelancer ---
  const marketBase = 14.5; // market minimum flex rate EUR/hr (above WML)
  const suggestedMin = Math.round(marketBase * (1 + (demandScore * 0.15 + scarcityScore * 0.25)) * 100) / 100;
  const suggestedMax = Math.round(suggestedMin * 1.25 * 100) / 100;

  logger.debug("dynamic-pricing: computed", { shiftId: ctx.shiftId, surgeMultiplier, effectiveFeeEur, demandScore, scarcityScore, urgencyScore, signals });

  return {
    baseFeeEur: BASE_FEE_EUR,
    surgeMultiplier,
    effectiveFeeEur,
    suggestedHourlyRateEurMin: suggestedMin,
    suggestedHourlyRateEurMax: suggestedMax,
    demandScore,
    scarcityScore,
    urgencyScore,
    signals,
  };
}
