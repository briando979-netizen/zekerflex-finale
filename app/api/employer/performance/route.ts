import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const company = await prisma.company.findFirst({
      where: { ownerId: principal.userId },
    });

    if (!company) {
      throw AppError.notFound("Company not found");
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalShifts, completedShifts, cancelledShifts, avgRating, totalCost, activeWorkers] = await Promise.all([
      prisma.shift.count({
        where: { companyId: company.id },
      }),
      prisma.shiftAssignment.count({
        where: {
          shift: { companyId: company.id },
          status: "COMPLETED",
        },
      }),
      prisma.shiftAssignment.count({
        where: {
          shift: { companyId: company.id },
          status: "CANCELLED",
        },
      }),
      prisma.shiftReview.aggregate({
        where: {
          shiftAssignment: { shift: { companyId: company.id } },
          type: "EMPLOYER_REVIEW",
        },
        _avg: { rating: true },
      }),
      prisma.platformFee.aggregate({
        where: { companyId: company.id },
        _sum: { amountCents: true },
      }),
      prisma.shiftAssignment.findMany({
        where: {
          shift: { companyId: company.id },
          status: { in: ["ACCEPTED", "COMPLETED"] },
          createdAt: { gte: thirtyDaysAgo },
        },
        distinct: ["freelancerId"],
      }),
    ]);

    return NextResponse.json({
      performance: {
        totalShifts,
        completedShifts,
        completionRate: totalShifts > 0 ? Math.round((completedShifts / totalShifts) * 100) : 0,
        cancelledShifts,
        cancellationRate: totalShifts > 0 ? Math.round((cancelledShifts / totalShifts) * 100) : 0,
        averageRating: avgRating._avg.rating || 0,
        totalSpent: Math.round((totalCost._sum.amountCents || 0) / 100),
        uniqueWorkers: activeWorkers.length,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
