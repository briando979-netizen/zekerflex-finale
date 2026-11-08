import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
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

    const shifts = await prisma.shift.findMany({
      where: {
        companyId: company.id,
        createdAt: { gte: thirtyDaysAgo },
      },
      include: {
        assignments: true,
      },
    });

    // Calculate various metrics
    const totalHours = shifts.reduce((sum, s) => {
      const diff = new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime();
      return sum + diff / (1000 * 60 * 60);
    }, 0);

    const filledHours = shifts
      .filter((s) => s.assignments.some((a) => a.status === "ACCEPTED"))
      .reduce((sum, s) => {
        const diff = new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime();
        return sum + diff / (1000 * 60 * 60);
      }, 0);

    const avgPayRate = shifts.length > 0 ? shifts.reduce((sum, s) => sum + (s.hourlyRate || 0), 0) / shifts.length : 0;

    const peakDays = shifts.reduce(
      (acc, s) => {
        const day = new Date(s.startsAt).toLocaleDateString();
        acc[day] = (acc[day] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    return NextResponse.json({
      summary: {
        totalShifts: shifts.length,
        totalHours: Math.round(totalHours),
        filledHours: Math.round(filledHours),
        utilizationPercent: totalHours > 0 ? Math.round((filledHours / totalHours) * 100) : 0,
        avgPayRatePerHour: Math.round(avgPayRate * 100) / 100,
      },
      trends: {
        peakDay: Object.entries(peakDays).sort(([, a], [, b]) => b - a)[0]?.[0] || "N/A",
        shiftsPerDay: Math.round(shifts.length / 30),
      },
      topSkillsNeeded: ["communication", "teamwork", "reliability"],
      returnWorkerRate: 65, // placeholder
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
