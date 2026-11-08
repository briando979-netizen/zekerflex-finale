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
      include: { tafels: true },
    });

    if (!zaak) {
      throw AppError.notFound("Horeca zaak not found");
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const [todayOrders, occupiedTables, todayRevenue] = await Promise.all([
      prisma.horecaBestelling.count({
        where: { zaakId: zaak.id, createdAt: { gte: today, lt: tomorrow } },
      }),
      prisma.horecaBestelling.findMany({
        where: { zaakId: zaak.id, createdAt: { gte: today, lt: tomorrow }, status: { in: ["OPEN", "IN_BEREIDING"] } },
        select: { tafelId: true },
        distinct: ["tafelId"],
      }),
      prisma.horecaBetaling.aggregate({
        where: { zaakId: zaak.id, createdAt: { gte: today, lt: tomorrow }, status: "BETAALD" },
        _sum: { bedragCent: true },
      }),
    ]);

    return NextResponse.json({
      stats: {
        totalTables: zaak.tafels.length,
        occupiedTables: occupiedTables.length,
        todayOrders,
        todayRevenue: Math.round((todayRevenue._sum.bedragCent || 0) / 100),
        occupancyRate: zaak.tafels.length > 0 ? Math.round((occupiedTables.length / zaak.tafels.length) * 100) : 0,
      },
      tables: zaak.tafels.map((t) => ({
        id: t.id,
        number: t.nummer,
        capacity: t.stoelen,
        status: occupiedTables.some((ot) => ot.tafelId === t.id) ? "bezet" : "vrij",
      })),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
