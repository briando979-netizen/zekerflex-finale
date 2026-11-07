import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const scope = await resolveEmployerScope(principal);
    const tenantId = scope.tenantIds[0];

    if (!tenantId) {
      throw AppError.precondition("Geen organisatie gekoppeld");
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [shiftsCreated, shiftsThisWeek, shiftsThisMonth, activeWorkers, pendingApprovals] = await Promise.all([
      prisma.shift.count({
        where: { branch: { tenantId } },
      }),
      prisma.shift.count({
        where: {
          branch: { tenantId },
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      prisma.shift.count({
        where: {
          branch: { tenantId },
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.shiftAssignment.findMany({
        where: {
          shift: { branch: { tenantId } },
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { freelancerId: true },
        distinct: ["freelancerId"],
      }),
      prisma.timesheet.count({
        where: {
          shiftAssignment: {
            shift: { branch: { tenantId } },
          },
          status: "SUBMITTED",
        },
      }),
    ]);

    return NextResponse.json({
      shiftsCreated,
      shiftsThisWeek,
      shiftsThisMonth,
      activeWorkers: activeWorkers.length,
      pendingApprovals,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
