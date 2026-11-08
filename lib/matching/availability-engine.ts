import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { Shift, ShiftAssignment } from "@prisma/client";

/**
 * Availability window for a freelancer.
 */
export interface AvailabilityWindow {
  freelancerId: string;
  startsAt: Date;
  endsAt: Date;
  isRecurring: boolean;
  notes?: string;
}

/**
 * Availability conflict details.
 */
export interface AvailabilityConflict {
  conflictsWith: string; // Shift ID or assignment ID
  conflictType: "overlap" | "insufficient_prep_time" | "travel_impossible";
  severityScore: number; // [0, 1]
  details: string;
}

/**
 * Result of availability matching for a freelancer against a shift.
 */
export interface AvailabilityMatchResult {
  isAvailable: boolean;
  conflicts: AvailabilityConflict[];
  overlapMinutes: number;
  prepTimeMinutes: number;
  score: number; // [0, 1] - higher is better
}

/**
 * Check if a freelancer has any conflicting shifts during a time window.
 */
async function findConflictingAssignments(
  freelancerId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<ShiftAssignment[]> {
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      freelancerId,
      status: {
        in: ["ACCEPTED", "COMPLETED"],
      },
      shift: {
        startsAt: {
          lt: endsAt,
        },
        endsAt: {
          gt: startsAt,
        },
      },
    },
    include: {
      shift: true,
    },
  });

  return assignments;
}

/**
 * Calculate overlap minutes between two time windows.
 */
function calculateOverlapMinutes(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date,
): number {
  const overlapStart = Math.max(start1.getTime(), start2.getTime());
  const overlapEnd = Math.min(end1.getTime(), end2.getTime());

  if (overlapStart >= overlapEnd) {
    return 0;
  }

  return (overlapEnd - overlapStart) / (1000 * 60);
}

/**
 * Check if freelancer has enough time to travel between two locations.
 * Assumes 30 minutes base prep + 5 min per km as a heuristic.
 */
function canTravelBetween(
  fromEnd: Date,
  toStart: Date,
  estimatedTravelMinutes: number,
): boolean {
  const bufferMinutes = 30; // Minimum prep time
  const availableMinutes = (toStart.getTime() - fromEnd.getTime()) / (1000 * 60);
  return availableMinutes >= estimatedTravelMinutes + bufferMinutes;
}

/**
 * Score availability based on how close the shift is to existing commitments.
 * Returns [0, 1] where 1 is ideal availability.
 */
function scoreAvailability(
  conflicts: AvailabilityConflict[],
  overlapMinutes: number,
  prepTimeMinutes: number,
): number {
  if (conflicts.length === 0) {
    return 1;
  }

  let penaltyScore = 0;

  for (const conflict of conflicts) {
    penaltyScore += conflict.severityScore;
  }

  // Normalize penalty (multiple conflicts compound)
  const conflictPenalty = Math.min(penaltyScore, 1);

  // Additional penalty for prep time issues
  const prepPenalty = prepTimeMinutes < 30 ? 0.3 : 0;

  return Math.max(0, 1 - conflictPenalty - prepPenalty);
}

/**
 * Check availability of a freelancer for a specific shift.
 */
export async function checkAvailability(
  freelancerId: string,
  shift: Shift,
  estimatedTravelMinutes = 30,
): Promise<AvailabilityMatchResult> {
  const conflicts: AvailabilityConflict[] = [];
  let overlapMinutes = 0;

  // Check for direct time overlaps
  const conflictingAssignments = await findConflictingAssignments(freelancerId, shift.startsAt, shift.endsAt);

  for (const assignment of conflictingAssignments) {
    const overlap = calculateOverlapMinutes(
      shift.startsAt,
      shift.endsAt,
      assignment.shift.startsAt,
      assignment.shift.endsAt,
    );

    overlapMinutes += overlap;

    conflicts.push({
      conflictsWith: assignment.shiftId,
      conflictType: "overlap",
      severityScore: Math.min(overlap / 120, 1), // Max severity at 2 hours
      details: `Overlaps with existing shift by ${Math.round(overlap)} minutes`,
    });
  }

  // Check prep time between shifts
  if (conflictingAssignments.length > 0) {
    for (const assignment of conflictingAssignments) {
      let prepTime = 0;

      // Time before this shift to previous assignment
      if (assignment.shift.endsAt < shift.startsAt) {
        prepTime = (shift.startsAt.getTime() - assignment.shift.endsAt.getTime()) / (1000 * 60);

        if (!canTravelBetween(assignment.shift.endsAt, shift.startsAt, estimatedTravelMinutes)) {
          conflicts.push({
            conflictsWith: assignment.shiftId,
            conflictType: "travel_impossible",
            severityScore: 0.4,
            details: `Insufficient time to travel from previous shift (${Math.round(prepTime)} min available)`,
          });
        }
      }

      // Time after this shift to next assignment
      if (assignment.shift.startsAt > shift.endsAt) {
        prepTime = (assignment.shift.startsAt.getTime() - shift.endsAt.getTime()) / (1000 * 60);

        if (!canTravelBetween(shift.endsAt, assignment.shift.startsAt, estimatedTravelMinutes)) {
          conflicts.push({
            conflictsWith: assignment.shiftId,
            conflictType: "travel_impossible",
            severityScore: 0.4,
            details: `Insufficient time to travel to next shift (${Math.round(prepTime)} min available)`,
          });
        }
      }
    }
  }

  const prepTimeMinutes =
    conflictingAssignments.length > 0
      ? Math.min(
          ...[
            ...conflictingAssignments.map((a) =>
              a.shift.endsAt < shift.startsAt
                ? (shift.startsAt.getTime() - a.shift.endsAt.getTime()) / (1000 * 60)
                : Infinity,
            ),
            ...conflictingAssignments.map((a) =>
              a.shift.startsAt > shift.endsAt
                ? (a.shift.startsAt.getTime() - shift.endsAt.getTime()) / (1000 * 60)
                : Infinity,
            ),
          ].filter((v) => v !== Infinity),
        )
      : 999;

  const isAvailable = conflicts.length === 0 || overlapMinutes === 0;
  const score = scoreAvailability(conflicts, overlapMinutes, prepTimeMinutes);

  return {
    isAvailable,
    conflicts,
    overlapMinutes,
    prepTimeMinutes: Math.round(prepTimeMinutes),
    score,
  };
}

/**
 * Batch check availability for multiple freelancers.
 */
export async function batchCheckAvailability(
  freelancerIds: string[],
  shift: Shift,
): Promise<
  Array<{
    freelancerId: string;
    result: AvailabilityMatchResult;
  }>
> {
  const results = await Promise.all(
    freelancerIds.map(async (fid) => ({
      freelancerId: fid,
      result: await checkAvailability(fid, shift),
    })),
  );

  return results;
}

/**
 * Find best time windows for a freelancer across next N days.
 * Useful for matching multiple shifts or forecasting availability.
 */
export async function findAvailableTimeWindows(
  freelancerId: string,
  fromDate: Date,
  toDate: Date,
  minWindowMinutes = 120,
): Promise<AvailabilityWindow[]> {
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      freelancerId,
      status: {
        in: ["ACCEPTED", "COMPLETED"],
      },
      shift: {
        startsAt: {
          lt: toDate,
        },
        endsAt: {
          gt: fromDate,
        },
      },
    },
    include: {
      shift: true,
    },
    orderBy: {
      shift: {
        startsAt: "asc",
      },
    },
  });

  const windows: AvailabilityWindow[] = [];
  let currentStart = fromDate;

  for (const assignment of assignments) {
    if (currentStart < assignment.shift.startsAt) {
      const windowMinutes = (assignment.shift.startsAt.getTime() - currentStart.getTime()) / (1000 * 60);
      if (windowMinutes >= minWindowMinutes) {
        windows.push({
          freelancerId,
          startsAt: currentStart,
          endsAt: assignment.shift.startsAt,
          isRecurring: false,
        });
      }
    }
    currentStart = assignment.shift.endsAt;
  }

  // Add final window
  if (currentStart < toDate) {
    const windowMinutes = (toDate.getTime() - currentStart.getTime()) / (1000 * 60);
    if (windowMinutes >= minWindowMinutes) {
      windows.push({
        freelancerId,
        startsAt: currentStart,
        endsAt: toDate,
        isRecurring: false,
      });
    }
  }

  return windows;
}
