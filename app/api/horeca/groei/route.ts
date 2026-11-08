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
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [currentPeriod, previousPeriod] = await Promise.all([
      prisma.horecaBetaling.aggregate({
        where: { zaakId: zaak.id, createdAt: { gte: thirtyDaysAgo }, status: "BETAALD" },
        _sum: { bedragCent: true },
        _count: { id: true },
      }),
      prisma.horecaBetaling.aggregate({
        where: { zaakId: zaak.id, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo }, status: "BETAALD" },
        _sum: { bedragCent: true },
        _count: { id: true },
      }),
    ]);

    const current = (currentPeriod._sum.bedragCent || 0) / 100;
    const previous = (previousPeriod._sum.bedragCent || 0) / 100;
    const growth = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;

    return NextResponse.json({
      currentRevenue: Math.round(current),
      previousRevenue: Math.round(previous),
      growthPercentage: growth,
      currentOrders: currentPeriod._count.id,
      previousOrders: previousPeriod._count.id,
      orderGrowth: previousPeriod._count.id > 0 ? Math.round(((currentPeriod._count.id - previousPeriod._count.id) / previousPeriod._count.id) * 100) : 0,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
