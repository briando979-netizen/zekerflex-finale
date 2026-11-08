import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    if (!hasRole(principal, "PLATFORM_ADMIN")) {
      throw AppError.forbidden("Admin access required");
    }

    const reportType = request.nextUrl.searchParams.get("type") || "monthly";
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Gather report data
    const [
      totalWorkers,
      totalCompanies,
      totalShifts,
      completedShifts,
      totalEarnings,
      platformFees,
      avgWorkerRating,
      disputes,
    ] = await Promise.all([
      prisma.freelancerProfile.count(),
      prisma.company.count(),
      prisma.shift.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.shiftAssignment.count({
        where: { status: "COMPLETED", completedAt: { gte: thirtyDaysAgo } },
      }),
      prisma.review.aggregate({
        _sum: { rating: true },
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.invoice.aggregate({
        _sum: { amount: true },
        where: { type: "PLATFORM_FEE", createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.review.aggregate({
        _avg: { rating: true },
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.dispute.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    ]);

    // Generate simple text report
    const reportContent = `
ZekerFlex Platform Report - ${new Date().toISOString().split("T")[0]}

EXECUTIVE SUMMARY
=================
Report Type: ${reportType}
Generated: ${new Date().toLocaleString()}

WORKER METRICS
==============
Total Workers: ${totalWorkers}
Active (30d): ${await prisma.freelancerProfile.count({
      where: {
        assignments: { some: { createdAt: { gte: thirtyDaysAgo } } },
      },
    })}
Avg Rating: ${avgWorkerRating._avg.rating?.toFixed(2) || "N/A"}/5.0

EMPLOYER METRICS
================
Total Companies: ${totalCompanies}
Active (30d): ${await prisma.company.count({
      where: {
        shifts: { some: { createdAt: { gte: thirtyDaysAgo } } },
      },
    })}

PLATFORM METRICS
================
Shifts Created (30d): ${totalShifts}
Shifts Completed (30d): ${completedShifts}
Completion Rate: ${totalShifts > 0 ? Math.round((completedShifts / totalShifts) * 100) : 0}%
Platform Fees (30d): €${platformFees._sum.amount || 0}

DISPUTES
========
Disputes (30d): ${disputes}

END REPORT
==========
`;

    return new NextResponse(reportContent, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": "attachment; filename=zekerflex-report.txt",
      },
    });
  } catch (err) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
