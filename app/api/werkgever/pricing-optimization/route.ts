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

    // Analyze recent shifts
    const shifts = await prisma.shift.findMany({
      where: {
        companyId: company.id,
        createdAt: { gte: thirtyDaysAgo },
      },
      include: {
        assignments: true,
      },
    });

    // Calculate metrics for pricing optimization
    const avgRate = shifts.length > 0 ? shifts.reduce((sum, s) => sum + (s.hourlyRate || 0), 0) / shifts.length : 0;
    const filledRate = shifts.length > 0 ? (shifts.filter((s) => s.assignments.some((a) => a.status === "ACCEPTED")).length / shifts.length) * 100 : 0;
    const marketRate = avgRate * 1.1; // Simple market baseline

    let recommendation = {
      current: Math.round(avgRate),
      suggested: Math.round(marketRate),
      reasoning: [] as string[],
      impact: {
        fillRateIncrease: 0,
        costIncrease: 0,
      },
    };

    // Add reasoning
    if (filledRate < 60) {
      recommendation.reasoning.push("Low fill rate — consider competitive pricing");
      recommendation.suggested = Math.round(avgRate * 0.95);
      recommendation.impact.fillRateIncrease = 15;
    } else if (filledRate > 90) {
      recommendation.reasoning.push("High demand — can optimize rates upward");
      recommendation.suggested = Math.round(avgRate * 1.08);
      recommendation.impact.costIncrease = 8;
    } else {
      recommendation.reasoning.push("Market-rate pricing is optimal");
    }

    // Consider shift type
    const nightShifts = shifts.filter((s) => new Date(s.startsAt).getHours() >= 20).length;
    if (nightShifts > shifts.length * 0.3) {
      recommendation.reasoning.push("Many night shifts — consider night shift premium (+15%)");
    }

    return NextResponse.json({
      current: {
        hourlyRate: Math.round(avgRate),
        fillRate: Math.round(filledRate),
        shiftsAnalyzed: shifts.length,
      },
      recommendation,
      marketData: {
        averageMarketRate: Math.round(marketRate),
        competitorMin: Math.round(avgRate * 0.9),
        competitorMax: Math.round(avgRate * 1.15),
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
