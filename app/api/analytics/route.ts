import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();

    const tenant = await prisma.tenant.findFirst({
      where: { memberships: { some: { userId: principal.userId } } },
    });

    if (!tenant) {
      throw AppError.notFound("Tenant not found");
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalBookings, revenue, customers, avgOrderValue, topProducts, bookingsByDay] = await Promise.all([
      prisma.booking.count({
        where: {
          tenantId: tenant.id,
          datumTijd: { gte: thirtyDaysAgo },
        },
      }),
      prisma.booking.aggregate({
        where: {
          tenantId: tenant.id,
          datumTijd: { gte: thirtyDaysAgo },
          status: { in: ["COMPLETED", "CONFIRMED"] },
        },
        _sum: { bedragCent: true },
      }),
      prisma.customer.count({
        where: { tenantId: tenant.id },
      }),
      prisma.booking.aggregate({
        where: {
          tenantId: tenant.id,
          datumTijd: { gte: thirtyDaysAgo },
          status: { in: ["COMPLETED", "CONFIRMED"] },
        },
        _avg: { bedragCent: true },
      }),
      prisma.booking.groupBy({
        by: ["productId"],
        where: {
          tenantId: tenant.id,
          datumTijd: { gte: thirtyDaysAgo },
        },
        _count: { id: true },
        _sum: { bedragCent: true },
        orderBy: { _sum: { bedragCent: "desc" } },
        take: 5,
      }),
      prisma.booking.groupBy({
        by: ["datumTijd"],
        where: {
          tenantId: tenant.id,
          datumTijd: { gte: thirtyDaysAgo },
        },
        _count: { id: true },
      }),
    ]);

    return NextResponse.json({
      summary: {
        totalBookings,
        revenue: Math.round((revenue._sum.bedragCent || 0) / 100),
        totalCustomers: customers,
        avgOrderValue: avgOrderValue._avg.bedragCent ? Math.round((avgOrderValue._avg.bedragCent || 0) / 100) : 0,
      },
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        orders: p._count.id,
        revenue: Math.round((p._sum.bedragCent || 0) / 100),
      })),
      period: "last_30_days",
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
