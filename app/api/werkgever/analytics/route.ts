import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const companyId = request.nextUrl.searchParams.get("companyId");

    if (!companyId) {
      throw AppError.validation("Company ID required");
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [totalShifts, completedShifts, avgRating, thisMonthCost, lastMonthCost, topFreelancers] = await Promise.all([
      prisma.shift.count({
        where: { companyId },
      }),
      prisma.shiftAssignment.count({
        where: { shift: { companyId }, status: "COMPLETED" },
      }),
      prisma.shiftReview.aggregate({
        where: {
          type: "EMPLOYER_REVIEW",
          shiftAssignment: { shift: { companyId } },
        },
        _avg: { rating: true },
      }),
      prisma.platformFee.aggregate({
        where: {
          companyId,
          createdAt: { gte: new Date(new Date().setDate(1)) },
        },
        _sum: { amountCents: true },
      }),
      prisma.platformFee.aggregate({
        where: {
          companyId,
          createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
        },
        _sum: { amountCents: true },
      }),
      prisma.shiftAssignment.groupBy({
        by: ["freelancerId"],
        where: { shift: { companyId }, status: "COMPLETED" },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 5,
      }),
    ]);

    const completionRate = totalShifts > 0 ? Math.round((completedShifts / totalShifts) * 100) : 0;
    const thisMonthTotal = Math.round((thisMonthCost._sum.amountCents || 0) / 100);
    const lastMonthTotal = Math.round((lastMonthCost._sum.amountCents || 0) / 100);
    const monthlyGrowth = lastMonthTotal > 0 ? Math.round(((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100) : 0;

    return NextResponse.json({
      stats: {
        totalShifts,
        completedShifts,
        completionRate,
        averageRating: avgRating._avg.rating || 0,
        thisMonthCost: thisMonthTotal,
        lastMonthCost: lastMonthTotal,
        monthlyGrowth,
        topFreelancers: topFreelancers.length,
      },
      period: "last_30_days",
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
