import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    const [completedShifts, totalShifts, avgRating, reviews, disputes, skills] = await Promise.all([
      prisma.shiftAssignment.count({
        where: { freelancerId: freelancer.id, status: "COMPLETED" },
      }),
      prisma.shiftAssignment.count({
        where: { freelancerId: freelancer.id },
      }),
      prisma.review.aggregate({
        where: { subjectId: principal.userId },
        _avg: { rating: true },
      }),
      prisma.review.count({ where: { subjectId: principal.userId } }),
      prisma.dispute.count({
        where: { createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.skill.count({
        where: { freelancerProfiles: { some: { userId: principal.userId } } },
      }),
    ]);

    let score = 50; // Base

    // Completion rate (0-30)
    const completionRate = totalShifts > 0 ? (completedShifts / totalShifts) * 100 : 0;
    score += (completionRate / 100) * 30;

    // Reviews (0-20)
    if (reviews > 0) {
      score += Math.min(20, (reviews / 50) * 20);
    }

    // Rating (0-25)
    if (avgRating._avg.rating) {
      score += (avgRating._avg.rating / 5) * 25;
    }

    // Skills (0-10)
    if (skills > 3) score += 10;
    else if (skills > 0) score += (skills / 3) * 10;

    // Disputes penalty
    score -= disputes * 5;

    const finalScore = Math.min(100, Math.max(0, score));

    const badges = [];
    if (completionRate >= 95) badges.push("reliable");
    if (avgRating._avg.rating >= 4.5) badges.push("excellent");
    if (reviews >= 50) badges.push("trusted");
    if (skills >= 5) badges.push("skilled");
    if (disputes === 0) badges.push("clean-record");

    return NextResponse.json({
      score: Math.round(finalScore),
      badges,
      stats: {
        completedShifts,
        totalShifts,
        completionRate: Math.round(completionRate),
        avgRating: avgRating._avg.rating || 0,
        reviewCount: reviews,
        skills,
        disputes,
      },
      level: finalScore >= 80 ? "premium" : finalScore >= 60 ? "trusted" : "standard",
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
