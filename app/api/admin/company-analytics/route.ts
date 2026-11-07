import { NextRequest, NextResponse } from "next/server";
import { getPrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

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

    const [tenant, members, branches, shifts, shiftsThisMonth, activeWorkers, totalEarnings, invoices] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          createdAt: true,
          kvkNumber: true,
          type: true,
        },
      }),
      prisma.membership.count({ where: { tenantId } }),
      prisma.branch.count({ where: { tenantId } }),
      prisma.shift.count({ where: { branch: { tenantId } } }),
      prisma.shift.count({
        where: {
          branch: { tenantId },
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.shiftAssignment.findMany({
        where: { shift: { branch: { tenantId } } },
        select: { freelancerId: true },
        distinct: ["freelancerId"],
      }),
      prisma.invoice.aggregate({
        where: { issuedByTenantId: tenantId, status: "PAID" },
        _sum: { amountCents: true },
      }),
      prisma.invoice.count({
        where: { issuedByTenantId: tenantId },
      }),
    ]);

    if (!tenant) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({
      company: tenant,
      metrics: {
        members,
        branches,
        shiftsAll: shifts,
        shiftsThisMonth,
        activeWorkers: activeWorkers.length,
        totalEarningsCents: totalEarnings._sum.amountCents || 0,
        invoicesCount: invoices,
      },
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
