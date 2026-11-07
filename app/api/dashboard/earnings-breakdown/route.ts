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

    const period = request.nextUrl.searchParams.get("period") || "month";
    let dateFrom: Date;

    if (period === "week") {
      dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === "year") {
      dateFrom = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    } else {
      dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        freelancerId: freelancer.id,
        createdAt: { gte: dateFrom },
      },
      include: {
        shift: { select: { title: true, hourlyRateCents: true } },
      },
    });

    const totalEarnings = assignments.reduce((sum, a) => sum + (a.earningsCents || 0), 0);
    const completedEarnings = assignments
      .filter((a) => a.status === "COMPLETED")
      .reduce((sum, a) => sum + (a.earningsCents || 0), 0);

    const byShift: Record<string, { count: number; earnings: number }> = {};
    assignments.forEach((a) => {
      if (!byShift[a.shift.title]) {
        byShift[a.shift.title] = { count: 0, earnings: 0 };
      }
      byShift[a.shift.title].count++;
      byShift[a.shift.title].earnings += a.earningsCents || 0;
    });

    return NextResponse.json({
      period,
      totalEarningsCents: totalEarnings,
      completedEarningsCents: completedEarnings,
      pendingEarningsCents: totalEarnings - completedEarnings,
      shiftsCount: assignments.length,
      completedShifts: assignments.filter((a) => a.status === "COMPLETED").length,
      byShift: Object.entries(byShift).map(([title, data]) => ({
        title,
        ...data,
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
