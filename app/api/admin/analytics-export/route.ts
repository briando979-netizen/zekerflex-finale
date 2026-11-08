import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    if (!hasRole(principal, "PLATFORM_ADMIN")) {
      throw AppError.forbidden("Admin access required");
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Aggregate data
    const [
      totalWorkers,
      activeWorkers,
      totalShifts,
      completedShifts,
      totalCompanies,
      activeCompanies,
      totalEarnings,
      avgWorkerRating,
    ] = await Promise.all([
      prisma.freelancerProfile.count(),
      prisma.freelancerProfile.count({
        where: {
          assignments: {
            some: { createdAt: { gte: thirtyDaysAgo } },
          },
        },
      }),
      prisma.shift.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.shiftAssignment.count({
        where: { status: "COMPLETED", completedAt: { gte: thirtyDaysAgo } },
      }),
      prisma.company.count(),
      prisma.company.count({
        where: {
          shifts: {
            some: { createdAt: { gte: thirtyDaysAgo } },
          },
        },
      }),
      prisma.review.aggregate({
        _sum: { rating: true },
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.review.aggregate({
        _avg: { rating: true },
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
    ]);

    // Create CSV export
    const csvData = [
      ["ZekerFlex Platform Analytics", new Date().toISOString()],
      [],
      ["Worker Metrics", ""],
      ["Total Workers", totalWorkers],
      ["Active (30d)", activeWorkers],
      ["Activation Rate", `${totalWorkers > 0 ? Math.round((activeWorkers / totalWorkers) * 100) : 0}%`],
      [],
      ["Shift Metrics", ""],
      ["Total Shifts Created", totalShifts],
      ["Completed Shifts", completedShifts],
      ["Completion Rate", `${totalShifts > 0 ? Math.round((completedShifts / totalShifts) * 100) : 0}%`],
      [],
      ["Company Metrics", ""],
      ["Total Companies", totalCompanies],
      ["Active Companies", activeCompanies],
      ["Activity Rate", `${totalCompanies > 0 ? Math.round((activeCompanies / totalCompanies) * 100) : 0}%`],
      [],
      ["Quality Metrics", ""],
      ["Average Worker Rating", `${avgWorkerRating._avg.rating?.toFixed(2) || 0}`],
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=zekerflex-analytics.csv",
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
