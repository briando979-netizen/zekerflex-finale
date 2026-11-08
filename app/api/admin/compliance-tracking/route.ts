import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    if (!hasRole(principal, "PLATFORM_ADMIN")) {
      throw AppError.forbidden("Admin access required");
    }

    // Check various compliance metrics
    const [
      companiesWithoutKVK,
      companiesWithoutVAT,
      companiesWithoutPayment,
      workersWithoutVerification,
      shiftsMissingContracts,
      overduePayments,
    ] = await Promise.all([
      prisma.company.count({ where: { kvkNumber: null } }),
      prisma.company.count({ where: { vatNumber: null } }),
      prisma.company.count({ where: { paymentMethod: null } }),
      prisma.freelancerProfile.count({ where: { verified: false } }),
      prisma.shift.count({ where: { contractId: null } }),
      prisma.invoice.count({ where: { status: "OVERDUE" } }),
    ]);

    const complianceScore = Math.max(
      0,
      100 -
        (companiesWithoutKVK * 2 + companiesWithoutVAT * 2 + companiesWithoutPayment * 2 + workersWithoutVerification * 1.5 + shiftsMissingContracts * 1 + overduePayments * 3)
    );

    return NextResponse.json({
      overallScore: Math.round(complianceScore),
      issues: {
        companiesWithoutKVK,
        companiesWithoutVAT,
        companiesWithoutPayment,
        workersWithoutVerification,
        shiftsMissingContracts,
        overduePayments,
      },
      recommendations: [
        companiesWithoutKVK > 5 ? "Enforce KVK registration for new companies" : null,
        workersWithoutVerification > 20 ? "Launch worker verification campaign" : null,
        overduePayments > 10 ? "Review payment settlement process" : null,
      ].filter(Boolean),
      nextReview: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
