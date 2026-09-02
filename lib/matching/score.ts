import { env } from "@/lib/env";
import { haversineMeters } from "@/lib/geo/geofencing";
import {
  branchMatchingConfigSchema,
  type GeoPoint,
  type MatchScoreBreakdown,
  type ResolvedMatchingConfig,
  type TravelEstimate,
} from "@/types/matching";
import type { BadgeLevel, TravelMode } from "@prisma/client";

// Pure scoring math for the matching engine - no DB / Redis / network imports so
// it can be unit-tested in isolation and reused by simulation tooling.

const DEFAULT_TRAVEL_MODES: TravelMode[] = ["TRANSIT", "DRIVING", "BICYCLING"];

/** Additive score bonus per trust tier. Small by design - never decisive. */
const BADGE_BONUS: Record<BadgeLevel, number> = {
  BRONZE: 0,
  SILVER: 0.015,
  GOLD: 0.03,
  PLATINUM: 0.05,
};

export const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Home-to-branch distance (m) under which a freelancer counts as "local". */
export function localCatchmentMeters(branchGeofenceRadius: number): number {
  return Math.max(2500, branchGeofenceRadius * 10);
}

export function resolveMatchingConfig(raw: unknown): ResolvedMatchingConfig {
  const parsed = branchMatchingConfigSchema.safeParse(raw ?? {});
  const cfg = parsed.success ? parsed.data : {};

  const w = {
    reliability: cfg.weights?.reliability ?? env.MATCHING_WEIGHT_RELIABILITY,
    travel: cfg.weights?.travel ?? env.MATCHING_WEIGHT_TRAVEL,
    skill: cfg.weights?.skill ?? env.MATCHING_WEIGHT_SKILL,
  };
  const sum = w.reliability + w.travel + w.skill || 1;

  return {
    minScore: cfg.minScore ?? env.MATCHING_MIN_SCORE,
    maxTravelMinutes: cfg.maxTravelMinutes ?? env.MATCHING_MAX_TRAVEL_MINUTES,
    weights: {
      reliability: w.reliability / sum,
      travel: w.travel / sum,
      skill: w.skill / sum,
    },
    travelModes:
      (cfg.travelModes as TravelMode[] | undefined) ?? DEFAULT_TRAVEL_MODES,
    autoAcceptance: cfg.autoAcceptance
      ? {
          enabled: cfg.autoAcceptance.enabled,
          minScore: cfg.autoAcceptance.minScore,
          minAcceptanceScore: cfg.autoAcceptance.minAcceptanceScore,
          minReliabilityScore: cfg.autoAcceptance.minReliabilityScore,
          requireWithinGeofence:
            cfg.autoAcceptance.requireWithinGeofence ?? true,
          maxSeatsToAutoFill: cfg.autoAcceptance.maxSeatsToAutoFill ?? 1,
        }
      : null,
    offerTtlMinutes: cfg.offerTtlMinutes ?? 20,
    notificationWaveSize:
      cfg.notificationWaveSize === undefined ? 10 : cfg.notificationWaveSize,
  };
}

/**
 * Exponential decay of travel time to a [0,1] score. A commute at or above
 * `maxMinutes` scores ~0.05; a zero-minute commute scores 1.
 */
export function travelScore(minutes: number, maxMinutes: number): number {
  if (minutes <= 0) return 1;
  if (minutes >= maxMinutes) return 0.05;
  const k = 3 / maxMinutes;
  return Math.max(0.05, Math.exp(-k * minutes));
}

export function skillScore(rating: number | null, minRating: number): number {
  if (rating === null) return minRating > 0 ? 0 : 0.5;
  return clamp01(rating / 5);
}

export interface ShiftScoringContext {
  location: GeoPoint;
  minSkillRating: number;
  branchGeofenceRadiusMeters: number;
}

export interface CandidateSignals {
  home: GeoPoint;
  reliabilityScore: number;
  acceptanceScore: number;
  skillRating: number | null;
  badgeLevel?: BadgeLevel | null;
  travel: TravelEstimate;
}

export interface CandidateScore {
  score: number;
  breakdown: MatchScoreBreakdown;
  withinGeofence: boolean;
  eligible: boolean;
  ineligibleReason?: string;
}

/** Deterministically score one candidate against one shift. */
export function scoreCandidateSignals(
  signals: CandidateSignals,
  shift: ShiftScoringContext,
  config: ResolvedMatchingConfig,
): CandidateScore {
  const homeDistanceMeters = haversineMeters(signals.home, shift.location);
  const withinGeofence =
    homeDistanceMeters <=
    localCatchmentMeters(shift.branchGeofenceRadiusMeters);

  const penalties: string[] = [];
  if (signals.travel.approximate) {
    penalties.push("travel estimated (routing API unavailable)");
  }

  const reliability = clamp01(signals.reliabilityScore);
  const travelComponent = travelScore(
    signals.travel.durationMinutes,
    config.maxTravelMinutes,
  );
  const skill = skillScore(signals.skillRating, shift.minSkillRating);

  const badge = signals.badgeLevel ? BADGE_BONUS[signals.badgeLevel] : 0;

  let score =
    config.weights.reliability * reliability +
    config.weights.travel * travelComponent +
    config.weights.skill * skill;
  score += 0.05 * (clamp01(signals.acceptanceScore) - 0.5);
  score += badge;
  score = clamp01(score);

  const breakdown: MatchScoreBreakdown = {
    reliability,
    travel: travelComponent,
    skill,
    badge,
    weights: config.weights,
    penalties,
  };

  let eligible = true;
  let ineligibleReason: string | undefined;
  if (signals.travel.durationMinutes > config.maxTravelMinutes) {
    eligible = false;
    ineligibleReason = `Travel ${signals.travel.durationMinutes}m exceeds cap ${config.maxTravelMinutes}m`;
  } else if (
    signals.skillRating !== null &&
    signals.skillRating < shift.minSkillRating
  ) {
    eligible = false;
    ineligibleReason = `Skill rating ${signals.skillRating} below required ${shift.minSkillRating}`;
  } else if (score < config.minScore) {
    eligible = false;
    ineligibleReason = `Score ${score.toFixed(2)} below branch minimum ${config.minScore}`;
  }

  return {
    score,
    breakdown,
    withinGeofence,
    eligible,
    ...(ineligibleReason ? { ineligibleReason } : {}),
  };
}
