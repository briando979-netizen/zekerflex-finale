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
      throw AppError.notFound("Freelancer profile not found");
    }

    const [completedThisMonth, totalThisMonth, avgRating] = await Promise.all([
      prisma.shiftAssignment.count({
        where: {
          freelancerId: freelancer.id,
          status: "COMPLETED",
          completedAt: { gte: new Date(new Date().setDate(1)) },
        },
      }),
      prisma.shiftAssignment.count({
        where: {
          freelancerId: freelancer.id,
          createdAt: { gte: new Date(new Date().setDate(1)) },
        },
      }),
      prisma.review.aggregate({
        where: { subjectId: principal.userId },
        _avg: { rating: true },
      }),
    ]);

    let bonus = 0;
    const achievements = [];

    // 95%+ completion rate = €25
    if (totalThisMonth > 0 && (completedThisMonth / totalThisMonth) * 100 >= 95) {
      bonus += 25;
      achievements.push("reliability");
    }

    // 20+ shifts completed = €40
    if (completedThisMonth >= 20) {
      bonus += 40;
      achievements.push("volume");
    }

    // 4.7+ avg rating = €30
    if (avgRating._avg.rating && avgRating._avg.rating >= 4.7) {
      bonus += 30;
      achievements.push("excellence");
    }

    // 10+ shifts = €15
    if (completedThisMonth >= 10) {
      bonus += 15;
      achievements.push("consistent");
    }

    return NextResponse.json({
      bonus,
      achievements,
      progress: {
        completed: completedThisMonth,
        goal: 15,
        completionRate: totalThisMonth > 0 ? Math.round((completedThisMonth / totalThisMonth) * 100) : 0,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
