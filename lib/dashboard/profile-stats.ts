import { prisma } from "@/lib/prisma";
import { reviewSummary } from "@/lib/reviews/store";

// ---------------------------------------------------------------------------
// The "Account" hero numbers — matched shifts, not-completed, replacements
// arranged, over the last 6 months, plus the review score. Read-only.
// ---------------------------------------------------------------------------

export interface ProfileStats {
  matchedShifts: number;
  notCompleted: number;
  replacementsArranged: number;
  attendancePct: number | null;
  reviews: { average: number; count: number };
}

export async function getProfileStats(userId: string): Promise<ProfileStats> {
  const profile = await prisma.freelancerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) {
    return {
      matchedShifts: 0,
      notCompleted: 0,
      replacementsArranged: 0,
      attendancePct: null,
      reviews: { average: 0, count: 0 },
    };
  }

  const since = new Date();
  since.setMonth(since.getMonth() - 6);
  const now = new Date();

  const [assignments, replacements, reviews] = await Promise.all([
    prisma.shiftAssignment.findMany({
      where: { freelancerId: profile.id, acceptedAt: { gte: since } },
      select: {
        cancelledAt: true,
        shift: { select: { endsAt: true } },
        timesheet: { select: { status: true, actualStart: true } },
      },
    }),
    prisma.replacementRequest.count({
      where: {
        originalId: profile.id,
        createdAt: { gte: since },
        status: { in: ["CONFIRMED", "ACCEPTED_BY_SUBSTITUTE"] },
      },
    }),
    reviewSummary("freelancer", userId),
  ]);

  const matchedShifts = assignments.length;

  // "not completed" = a past assignment that was cancelled, or ended with no
  // check-in / no submitted timesheet.
  let notCompleted = 0;
  let showed = 0;
  let past = 0;
  for (const a of assignments) {
    const isPast = a.shift.endsAt < now;
    if (a.cancelledAt) {
      notCompleted++;
      if (isPast) past++;
      continue;
    }
    if (!isPast) continue;
    past++;
    const ts = a.timesheet;
    const cameIn = ts?.actualStart != null || ["SUBMITTED", "APPROVED", "DISPUTED", "PAID"].includes(ts?.status ?? "");
    if (cameIn) showed++;
    else notCompleted++;
  }

  return {
    matchedShifts,
    notCompleted,
    replacementsArranged: replacements,
    attendancePct: past > 0 ? Math.round((showed / past) * 100) : null,
    reviews: { average: reviews.average, count: reviews.count },
  };
}
