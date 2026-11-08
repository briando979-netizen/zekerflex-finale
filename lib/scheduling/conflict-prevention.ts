import { prisma } from "@/lib/prisma";

export interface ConflictCheckResult {
  hasConflict: boolean;
  conflicts: {
    shiftId: string;
    startTime: Date;
    endTime: Date;
    reason: string;
  }[];
}

export async function detectOverlappingShifts(
  freelancerId: string,
  proposedStart: Date,
  proposedEnd: Date
): Promise<ConflictCheckResult> {
  const existing = await prisma.assignment.findMany({
    where: {
      freelancer: { userId: freelancerId },
      shift: {
        startTime: { lt: proposedEnd },
        endTime: { gt: proposedStart },
        status: { not: "CANCELLED" },
      },
    },
    include: { shift: true },
  });

  const conflicts = existing.map((a) => ({
    shiftId: a.shift.id,
    startTime: a.shift.startTime,
    endTime: a.shift.endTime,
    reason: "Overlapping shift detected",
  }));

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
  };
}

export async function validateScheduleIntegrity(freelancerId: string): Promise<string[]> {
  const issues: string[] = [];
  const assignments = await prisma.assignment.findMany({
    where: { freelancer: { userId: freelancerId } },
    include: { shift: true },
    orderBy: { shift: { startTime: "asc" } },
  });

  for (let i = 0; i < assignments.length - 1; i++) {
    const current = assignments[i].shift;
    const next = assignments[i + 1].shift;
    const gap = (next.startTime.getTime() - current.endTime.getTime()) / 1000 / 60; // minutes

    if (gap < 15) {
      issues.push(`Only ${gap} min between shift ${current.id} and ${next.id}`);
    }
  }

  return issues;
}
