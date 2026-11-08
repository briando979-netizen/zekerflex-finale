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

    const today = new Date();
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const thisYear = new Date(today.getFullYear(), 0, 1);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [monthEarnings, yearEarnings, thirtyDayEarnings, pendingPayment] = await Promise.all([
      prisma.shiftAssignment.aggregate({
        where: {
          freelancerId: freelancer.id,
          status: "COMPLETED",
          completedAt: { gte: thisMonth },
        },
        _sum: { earnedCents: true },
      }),
      prisma.shiftAssignment.aggregate({
        where: {
          freelancerId: freelancer.id,
          status: "COMPLETED",
          completedAt: { gte: thisYear },
        },
        _sum: { earnedCents: true },
      }),
      prisma.shiftAssignment.aggregate({
        where: {
          freelancerId: freelancer.id,
          status: "COMPLETED",
          completedAt: { gte: thirtyDaysAgo },
        },
        _sum: { earnedCents: true },
      }),
      prisma.invoice.aggregate({
        where: {
          tenantId: freelancer.userId,
          status: { in: ["PENDING", "SENT"] },
          type: { in: ["INVOICE", "CREDIT"] },
        },
        _sum: { amountCents: true },
      }),
    ]);

    return NextResponse.json({
      thisMonth: Math.round((monthEarnings._sum.earnedCents || 0) / 100),
      thisYear: Math.round((yearEarnings._sum.earnedCents || 0) / 100),
      last30Days: Math.round((thirtyDayEarnings._sum.earnedCents || 0) / 100),
      pendingPayment: Math.round((pendingPayment._sum.amountCents || 0) / 100),
      averageDaily: thirtyDayEarnings._sum.earnedCents ? Math.round((thirtyDayEarnings._sum.earnedCents / 30) / 100) : 0,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
