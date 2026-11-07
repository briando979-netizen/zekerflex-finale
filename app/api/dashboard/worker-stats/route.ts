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

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get worker stats
    const [totalShifts, shiftsThisMonth, completedShifts, totalEarningsCents, upcomingShifts] = await Promise.all([
      // Total shifts ever worked
      prisma.shiftAssignment.count({
        where: { freelancerId: freelancer.id },
      }),
      // Shifts this month
      prisma.shiftAssignment.count({
        where: {
          freelancerId: freelancer.id,
          shift: { startsAt: { gte: thirtyDaysAgo } },
        },
      }),
      // Completed shifts
      prisma.shiftAssignment.count({
        where: {
          freelancerId: freelancer.id,
          status: "COMPLETED",
        },
      }),
      // Total earnings
      prisma.shiftAssignment.aggregate({
        where: { freelancerId: freelancer.id },
        _sum: { earningsCents: true },
      }),
      // Upcoming shifts (next 7 days)
      prisma.shiftAssignment.count({
        where: {
          freelancerId: freelancer.id,
          shift: {
            startsAt: {
              gte: now,
              lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            },
          },
          status: { in: ["ACCEPTED", "CONFIRMED"] },
        },
      }),
    ]);

    return NextResponse.json({
      totalShifts,
      shiftsThisMonth,
      completedShifts,
      totalEarningsCents: totalEarningsCents._sum.earningsCents || 0,
      upcomingShifts,
      completionRate: totalShifts > 0 ? (completedShifts / totalShifts) * 100 : 0,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
