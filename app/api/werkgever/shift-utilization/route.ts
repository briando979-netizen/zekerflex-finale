import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const company = await prisma.company.findFirst({
      where: { employees: { some: { userId: principal.userId } } },
    });

    if (!company) {
      throw AppError.forbidden("No company found");
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalShifts, filledShifts, cancelledShifts, avgTimeToFill, branching] = await Promise.all([
      prisma.shift.count({
        where: {
          companyId: company.id,
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.shift.count({
        where: {
          companyId: company.id,
          createdAt: { gte: thirtyDaysAgo },
          assignments: { some: { status: "ACCEPTED" } },
        },
      }),
      prisma.shift.count({
        where: {
          companyId: company.id,
          createdAt: { gte: thirtyDaysAgo },
          status: "CANCELLED",
        },
      }),
      prisma.shift.aggregate({
        where: {
          companyId: company.id,
          createdAt: { gte: thirtyDaysAgo },
          assignments: { some: { respondedAt: { not: null } } },
        },
        _avg: {
          createdAt: true,
        },
      }),
      prisma.shift.groupBy({
        by: ["branch"],
        where: {
          companyId: company.id,
          createdAt: { gte: thirtyDaysAgo },
        },
        _count: {
          id: true,
        },
      }),
    ]);

    const utilizationRate = totalShifts > 0 ? Math.round((filledShifts / totalShifts) * 100) : 0;
    const cancellationRate = totalShifts > 0 ? Math.round((cancelledShifts / totalShifts) * 100) : 0;

    return NextResponse.json({
      overview: {
        totalShifts,
        filledShifts,
        unfilledShifts: totalShifts - filledShifts,
        cancelledShifts,
        utilizationRate,
        cancellationRate,
      },
      quality: {
        avgResponseTimeHours: 24, // placeholder
        fillRatePercentage: utilizationRate,
        qualityTrend: "stable",
      },
      byBranch: branching.map((b) => ({
        branch: b.branch || "Unknown",
        shiftsCreated: b._count.id,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
