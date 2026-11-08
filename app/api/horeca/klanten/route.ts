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

    const [totalCustomers, newCustomers, topCustomers] = await Promise.all([
      prisma.horecaBestelling.findMany({
        where: { zaakId: zaak.id },
        select: { tafelId: true },
        distinct: ["tafelId"],
      }),
      prisma.horecaBestelling.findMany({
        where: { zaakId: zaak.id, createdAt: { gte: thirtyDaysAgo } },
        select: { tafelId: true },
        distinct: ["tafelId"],
      }),
      prisma.horecaBestelling.groupBy({
        by: ["tafelId"],
        where: { zaakId: zaak.id, createdAt: { gte: thirtyDaysAgo } },
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 3,
      }),
    ]);

    const avgSpending = await prisma.horecaBetaling.aggregate({
      where: { zaakId: zaak.id, createdAt: { gte: thirtyDaysAgo } },
      _avg: { bedragCent: true },
    });

    return NextResponse.json({
      totalCustomers: totalCustomers.length,
      newCustomers: newCustomers.length,
      topCustomers: topCustomers.length,
      avgSpending: Math.round((avgSpending._avg.bedragCent || 0) / 100),
      retention: totalCustomers.length > 0 ? Math.round(((totalCustomers.length - newCustomers.length) / totalCustomers.length) * 100) : 0,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
