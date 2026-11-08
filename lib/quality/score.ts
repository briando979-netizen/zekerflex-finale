import { prisma } from "@/lib/prisma";

export async function calculateWorkerQualityScore(freelancerId: string): Promise<number> {
  const [shifts, completedShifts, reviews, avgRating, complaints] = await Promise.all([
    prisma.shiftAssignment.count({ where: { freelancerId } }),
    prisma.shiftAssignment.count({
      where: { freelancerId, status: "COMPLETED" },
    }),
    prisma.review.findMany({
      where: { subjectId: freelancerId },
      select: { rating: true },
    }),
    prisma.review.aggregate({
      where: { subjectId: freelancerId },
      _avg: { rating: true },
    }),
    prisma.dispute.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  let score = 50; // Base score

  // Completion rate (max +30)
  if (shifts > 0) {
    const completionRate = (completedShifts / shifts) * 100;
    score += (completionRate / 100) * 30;
  }

  // Rating (max +15)
  if (avgRating._avg.rating) {
    score += (avgRating._avg.rating / 5) * 15;
  }

  // Review count bonus (max +5)
  if (reviews.length > 10) {
    score += 5;
  } else if (reviews.length > 0) {
    score += (reviews.length / 10) * 5;
  }

  // Complaints penalty
  score -= complaints * 2;

  return Math.min(100, Math.max(0, score));
}

export async function calculateCompanyHealthScore(tenantId: string): Promise<number> {
  const [shifts, completedShifts, disputes, avgWorkerRating] = await Promise.all([
    prisma.shift.count({ where: { branch: { tenantId } } }),
    prisma.shiftAssignment.count({
      where: {
        shift: { branch: { tenantId } },
        status: "COMPLETED",
      },
    }),
    prisma.dispute.count({
      where: {
        invoice: { issuedByTenantId: tenantId },
      },
    }),
    prisma.review.aggregate({
      where: {
        invoice: { issuedByTenantId: tenantId },
      },
      _avg: { rating: true },
    }),
  ]);

  let score = 50;

  // Shift completion rate (max +25)
  if (shifts > 0) {
    const completionRate = (completedShifts / shifts) * 100;
    score += (completionRate / 100) * 25;
  }

  // Dispute rate (max -20)
  const disputeRate = shifts > 0 ? (disputes / shifts) * 100 : 0;
  score -= Math.min(20, disputeRate);

  // Worker rating (max +20)
  if (avgWorkerRating._avg.rating) {
    score += (avgWorkerRating._avg.rating / 5) * 20;
  }

  // Activity bonus (max +5)
  if (shifts > 100) {
    score += 5;
  }

  return Math.min(100, Math.max(0, score));
}
