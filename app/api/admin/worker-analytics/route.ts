import { NextRequest, NextResponse } from "next/server";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const p = await getPrincipal();
    if (!p || !hasRole(p, "PLATFORM_ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const workerId = request.nextUrl.searchParams.get("workerId");
    if (!workerId) {
      return NextResponse.json({ error: "workerId required" }, { status: 400 });
    }

    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: workerId },
    });

    if (!freelancer) {
      return NextResponse.json({ error: "Worker not found" }, { status: 404 });
    }

    const [totalShifts, completedShifts, cancelledShifts, totalEarnings, avgRating, reviewCount] = await Promise.all([
      prisma.shiftAssignment.count({ where: { freelancerId: freelancer.id } }),
      prisma.shiftAssignment.count({
        where: { freelancerId: freelancer.id, status: "COMPLETED" },
      }),
      prisma.shiftAssignment.count({
        where: { freelancerId: freelancer.id, status: "CANCELLED" },
      }),
      prisma.shiftAssignment.aggregate({
        where: { freelancerId: freelancer.id },
        _sum: { earningsCents: true },
      }),
      prisma.review.aggregate({
        where: { subjectId: workerId },
        _avg: { rating: true },
      }),
      prisma.review.count({ where: { subjectId: workerId } }),
    ]);

    const completionRate = totalShifts > 0 ? (completedShifts / totalShifts) * 100 : 0;
    const noShowRate = totalShifts > 0 ? (cancelledShifts / totalShifts) * 100 : 0;

    return NextResponse.json({
      worker: {
        id: workerId,
        name: freelancer.userId,
      },
      metrics: {
        totalShifts,
        completedShifts,
        cancelledShifts,
        completionRate: Math.round(completionRate),
        noShowRate: Math.round(noShowRate),
        totalEarningsCents: totalEarnings._sum.earningsCents || 0,
        averageRating: avgRating._avg.rating || 0,
        reviewCount,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
