import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const zaak = await prisma.horecaZaak.findFirst({
      where: { tenants: { some: { memberships: { some: { userId: principal.userId } } } } },
    });

    if (!zaak) {
      throw AppError.notFound("Horeca zaak not found");
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalOrders, completedOrders, pendingOrders, totalRevenue] = await Promise.all([
      prisma.horecaBestelling.count({ where: { zaakId: zaak.id, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.horecaBestelling.count({
        where: { zaakId: zaak.id, status: "GEREED", createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.horecaBestelling.count({
        where: { zaakId: zaak.id, status: { in: ["OPEN", "IN_BEREIDING"] }, createdAt: { gte: thirtyDaysAgo } },
      }),
      prisma.horecaBetaling.aggregate({
        where: { zaakId: zaak.id, status: "BETAALD", createdAt: { gte: thirtyDaysAgo } },
        _sum: { bedragCent: true },
      }),
    ]);

    return NextResponse.json({
      stats: {
        totalOrders,
        completedOrders,
        pendingOrders,
        completionRate: totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0,
        totalRevenue: Math.round((totalRevenue._sum.bedragCent || 0) / 100),
      },
      period: "30 dagen",
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
