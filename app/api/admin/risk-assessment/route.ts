import { NextRequest, NextResponse } from "next/server";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const p = await getPrincipal();
    if (!p || !hasRole(p, "PLATFORM_ADMIN")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const tenantId = request.nextUrl.searchParams.get("tenantId");
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId required" }, { status: 400 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [cancelledShifts, disputedInvoices, lowRatingWorkers, totalShifts] = await Promise.all([
      prisma.shiftAssignment.count({
        where: {
          shift: { branch: { tenantId } },
          status: "CANCELLED",
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.dispute.count({
        where: {
          invoice: { issuedByTenantId: tenantId },
          createdAt: { gte: thirtyDaysAgo },
        },
      }),
      prisma.shiftAssignment.findMany({
        where: { shift: { branch: { tenantId } } },
        include: {
          shift: {
            select: {
              assignments: {
                select: {
                  freelancer: {
                    select: {
                      userId: true,
                    },
                  },
                },
              },
            },
          },
        },
        take: 10,
      }),
      prisma.shift.count({ where: { branch: { tenantId } } }),
    ]);

    const cancelRatePercent = totalShifts > 0 ? (cancelledShifts / totalShifts) * 100 : 0;
    let riskLevel = "low";
    if (cancelRatePercent > 20 || disputedInvoices > 5) {
      riskLevel = "high";
    } else if (cancelRatePercent > 10 || disputedInvoices > 2) {
      riskLevel = "medium";
    }

    return NextResponse.json({
      tenantId,
      riskLevel,
      metrics: {
        cancelledShifts,
        cancelRatePercent: Math.round(cancelRatePercent),
        disputedInvoices,
        lowRatingWorkers: 0,
      },
      recommendations: riskLevel !== "low" ? [
        "Review recent cancellations",
        "Check for pattern of disputes",
        "Verify worker qualifications",
      ] : [],
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
