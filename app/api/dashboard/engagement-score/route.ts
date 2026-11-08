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

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [acceptanceRate, responseTime, profileCompleteness, shifts] = await Promise.all([
      prisma.shiftAssignment.aggregate({
        where: {
          freelancerId: freelancer.id,
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: true,
      }),
      prisma.shiftAssignment.aggregate({
        where: {
          freelancerId: freelancer.id,
          status: "COMPLETED",
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: true,
      }),
      prisma.freelancerProfile.findUnique({
        where: { id: freelancer.id },
        select: {
          hourlyRate: true,
          bio: true,
          avatar: true,
          certifications: { select: { id: true } },
        },
      }),
      prisma.shiftAssignment.findMany({
        where: {
          freelancerId: freelancer.id,
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { respondedAt: true, createdAt: true },
        take: 10,
      }),
    ]);

    let engagement = 50; // base

    // Response rate
    if (shifts.length > 0) {
      const responded = shifts.filter((s) => s.respondedAt).length;
      engagement += (responded / shifts.length) * 20;
    }

    // Profile completeness
    if (profileCompleteness?.bio && profileCompleteness?.avatar) {
      engagement += 15;
    }
    if (profileCompleteness?.certifications && profileCompleteness.certifications.length > 0) {
      engagement += 10;
    }

    // Acceptance/completion
    if (acceptanceRate._count > 0) {
      const completionRate = (acceptanceRate._count > 0 ? 1 : 0) * 100;
      engagement += (completionRate / 100) * 15;
    }

    return NextResponse.json({
      score: Math.min(100, Math.max(0, engagement)),
      level: engagement >= 75 ? "highly-engaged" : engagement >= 50 ? "moderately-engaged" : "low-engagement",
      indicators: {
        profileComplete: !!profileCompleteness?.bio && !!profileCompleteness?.avatar,
        hasCertifications: !!profileCompleteness?.certifications?.length,
        responsiveInLastMonth: shifts.filter((s) => s.respondedAt).length > 0,
        activeThisMonth: shifts.length > 0,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
