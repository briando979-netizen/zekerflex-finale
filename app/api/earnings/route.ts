import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const period = request.nextUrl.searchParams.get("period") || "month";

    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    let dateFrom = new Date();
    if (period === "week") {
      dateFrom.setDate(dateFrom.getDate() - 7);
    } else if (period === "month") {
      dateFrom.setMonth(dateFrom.getMonth() - 1);
    } else if (period === "year") {
      dateFrom.setFullYear(dateFrom.getFullYear() - 1);
    }

    const [earnings, shifts, platformFees, bonuses] = await Promise.all([
      prisma.shiftAssignment.aggregate({
        where: {
          freelancerId: freelancer.id,
          status: "COMPLETED",
          completedAt: { gte: dateFrom },
        },
        _sum: { earnedCents: true },
      }),
      prisma.shiftAssignment.count({
        where: {
          freelancerId: freelancer.id,
          status: "COMPLETED",
          completedAt: { gte: dateFrom },
        },
      }),
      prisma.platformFee.aggregate({
        where: {
          freelancerId: freelancer.id,
          createdAt: { gte: dateFrom },
        },
        _sum: { amountCents: true },
      }),
      prisma.bonus.aggregate({
        where: {
          freelancerId: freelancer.id,
          createdAt: { gte: dateFrom },
        },
        _sum: { amountCents: true },
      }),
    ]);

    const gross = (earnings._sum.earnedCents || 0) / 100;
    const fees = (platformFees._sum.amountCents || 0) / 100;
    const bonus = (bonuses._sum.amountCents || 0) / 100;
    const net = gross - fees + bonus;

    return NextResponse.json({
      earnings: {
        gross: Math.round(gross),
        fees: Math.round(fees),
        bonus: Math.round(bonus),
        net: Math.round(net),
        shiftsCompleted: shifts,
        averagePerShift: shifts > 0 ? Math.round((gross / shifts) * 100) / 100 : 0,
      },
      period,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
