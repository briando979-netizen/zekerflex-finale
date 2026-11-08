import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const year = parseInt(request.nextUrl.searchParams.get("year") || new Date().getFullYear().toString());

    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);

    const [earnings, expenses, invoices] = await Promise.all([
      prisma.shiftAssignment.aggregate({
        where: {
          freelancerId: freelancer.id,
          status: "COMPLETED",
          completedAt: { gte: yearStart, lt: yearEnd },
        },
        _sum: { earnedCents: true },
      }),
      prisma.platformFee.aggregate({
        where: {
          freelancerId: freelancer.id,
          createdAt: { gte: yearStart, lt: yearEnd },
        },
        _sum: { amountCents: true },
      }),
      prisma.invoice.findMany({
        where: {
          tenantId: freelancer.userId,
          status: "PAID",
          paidAt: { gte: yearStart, lt: yearEnd },
        },
      }),
    ]);

    const grossIncome = (earnings._sum.earnedCents || 0) / 100;
    const expenses_ = (expenses._sum.amountCents || 0) / 100;
    const netIncome = grossIncome - expenses_;
    const taxEstimate = Math.round(netIncome * 0.30 * 100) / 100;

    return NextResponse.json({
      taxReport: {
        year,
        grossIncome: Math.round(grossIncome),
        expenses: Math.round(expenses_),
        netIncome: Math.round(netIncome),
        estimatedTax: taxEstimate,
        invoicesIssued: invoices.length,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
