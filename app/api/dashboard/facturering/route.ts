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

    const status = request.nextUrl.searchParams.get("status") || undefined;
    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId: freelancer.userId,
        ...(status && { status }),
        type: { in: ["INVOICE", "CREDIT"] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const stats = await Promise.all([
      prisma.invoice.aggregate({
        where: { tenantId: freelancer.userId, status: "PAID", type: "INVOICE" },
        _sum: { amountCents: true },
      }),
      prisma.invoice.aggregate({
        where: { tenantId: freelancer.userId, status: { in: ["PENDING", "SENT"] }, type: "INVOICE" },
        _sum: { amountCents: true },
      }),
    ]);

    return NextResponse.json({
      invoices: invoices.map((i) => ({
        id: i.id,
        amount: Math.round((i.amountCents || 0) / 100),
        status: i.status,
        dueDate: i.dueDate,
        createdAt: i.createdAt,
        number: i.number,
      })),
      stats: {
        totalPaid: Math.round((stats[0]._sum.amountCents || 0) / 100),
        totalPending: Math.round((stats[1]._sum.amountCents || 0) / 100),
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
