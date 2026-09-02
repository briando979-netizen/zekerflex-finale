import { z } from "zod";
import type { TravelMode } from "@prisma/client";

/** Geographic point in decimal degrees (WGS84). */
export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * Per-branch matching / auto-acceptance configuration. Persisted as JSON on
 * `Branch.matchingConfig`; unknown or missing fields fall back to platform
 * defaults from `env`.
 */
export const branchMatchingConfigSchema = z.object({
  /** Minimum weighted score for a freelancer to be notified at all. */
  minScore: z.number().min(0).max(1).optional(),
  /** Hard cap on door-to-door travel time in minutes. */
  maxTravelMinutes: z.number().positive().optional(),
  /** Score component weights; normalised at read time. */
  weights: z
    .object({
      reliability: z.number().min(0),
      travel: z.number().min(0),
      skill: z.number().min(0),
    })
    .partial()
    .optional(),
  /** Travel modes to evaluate, best (lowest time) wins. */
  travelModes: z
    .array(z.enum(["DRIVING", "TRANSIT", "BICYCLING", "WALKING"]))
    .nonempty()
    .optional(),
  /** Auto-assign (skip the accept step) when conditions below are all met. */
  autoAcceptance: z
    .object({
      enabled: z.boolean(),
      minScore: z.number().min(0).max(1),
      minAcceptanceScore: z.number().min(0).max(1),
      minReliabilityScore: z.number().min(0).max(1),
      requireWithinGeofence: z.boolean().default(true),
      maxSeatsToAutoFill: z.number().int().positive().default(1),
    })
    .optional(),
  /** How long a notified offer stays open before expiring (minutes). */
  offerTtlMinutes: z.number().int().positive().optional(),
  /** Notify in score-ranked waves of this size, `null` => all at once. */
  notificationWaveSize: z.number().int().positive().nullable().optional(),
});

export type BranchMatchingConfig = z.infer<typeof branchMatchingConfigSchema>;

export interface ResolvedMatchingConfig {
  minScore: number;
  maxTravelMinutes: number;
  weights: { reliability: number; travel: number; skill: number };
  travelModes: TravelMode[];
  autoAcceptance:
    | {
        enabled: boolean;
        minScore: number;
        minAcceptanceScore: number;
        minReliabilityScore: number;
        requireWithinGeofence: boolean;
        maxSeatsToAutoFill: number;
      }
    | null;
  offerTtlMinutes: number;
  notificationWaveSize: number | null;
}

export interface TravelEstimate {
  mode: TravelMode;
  durationMinutes: number;
  distanceMeters: number;
  /** true when derived from a heuristic rather than a live routing API. */
  approximate: boolean;
}

export interface MatchScoreBreakdown {
  reliability: number; // [0,1]
  travel: number; // [0,1] decay of travel time
  skill: number; // [0,1] normalised skill rating
  badge: number; // additive badge-level bonus
  weights: { reliability: number; travel: number; skill: number };
  penalties: string[]; // human-readable applied penalties
}

export interface MatchCandidate {
  freelancerId: string;
  userId: string;
  score: number;
  breakdown: MatchScoreBreakdown;
  travel: TravelEstimate;
  withinGeofence: boolean;
  eligible: boolean;
  ineligibleReason?: string;
}

export interface MatchingResult {
  shiftId: string;
  evaluated: number;
  eligible: number;
  notified: number;
  autoAssigned: number;
  seatsRemaining: number;
  candidates: MatchCandidate[];
}
