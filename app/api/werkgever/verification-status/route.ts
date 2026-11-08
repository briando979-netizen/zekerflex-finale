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
      throw AppError.precondition("No organization linked");
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        kvkNumber: true,
        companyRegistration: true,
        stripeCustomerId: true,
      },
    });

    if (!tenant) {
      throw AppError.notFound("Company not found");
    }

    const checks = [
      {
        id: "kvk",
        title: "KVK-nummer geverifieerd",
        completed: !!tenant.kvkNumber,
        priority: "high",
      },
      {
        id: "company-reg",
        title: "Bedrijfsregistratie",
        completed: !!tenant.companyRegistration,
        priority: "high",
      },
      {
        id: "payment",
        title: "Betaalmethode gekoppeld",
        completed: !!tenant.stripeCustomerId,
        priority: "medium",
      },
    ];

    const completedCount = checks.filter((c) => c.completed).length;
    const verificationProgress = (completedCount / checks.length) * 100;

    return NextResponse.json({
      verificationProgress: Math.round(verificationProgress),
      checks,
      verified: completedCount === checks.length,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
