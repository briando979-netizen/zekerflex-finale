import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePrincipal, hasRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z
    .enum([
      "DRAFT",
      "PENDING_FREELANCER_SIGNATURE",
      "PENDING_CLIENT_SIGNATURE",
      "ACTIVE",
      "DECLINED",
      "SUPERSEDED",
      "EXPIRED",
    ])
    .optional(),
});

/**
 * GET /api/model-agreements[?status=...]
 *
 * A freelancer sees their own model agreements; HQ_ADMIN / LOCAL_MANAGER see
 * their organization's; PLATFORM_ADMIN sees everything.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const log = logger.child({ route: "GET /api/model-agreements" });
  try {
    const principal = await requirePrincipal();
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      status: searchParams.get("status") ?? undefined,
    });
    const statusFilter = parsed.success ? parsed.data.status : undefined;

    const where: Prisma.ModelAgreementWhereInput = {};
    if (statusFilter) where.status = statusFilter;

    if (hasRole(principal, "PLATFORM_ADMIN")) {
      // no scope restriction
    } else if (hasRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "DISPUTE_MANAGER")) {
      const tenantIds = [
        ...new Set(principal.grants.map((g) => g.organizationId)),
      ];
      where.tenantId = { in: tenantIds };
    } else {
      const profile = await prisma.freelancerProfile.findUnique({
        where: { userId: principal.userId },
        select: { id: true },
      });
      if (!profile) return NextResponse.json({ agreements: [] });
      where.freelancerId = profile.id;
    }

    const agreements = await prisma.modelAgreement.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        reference: true,
        type: true,
        status: true,
        templateKey: true,
        templateVersion: true,
        belastingdienstNr: true,
        freelancerLegalName: true,
        freelancerKvkNumber: true,
        clientLegalName: true,
        clientKvkNumber: true,
        hourlyRateCents: true,
        scopeDescription: true,
        freelancerSignedAt: true,
        clientSignedAt: true,
        documentUrl: true,
        createdAt: true,
        shiftId: true,
        branchId: true,
      },
    });

    return NextResponse.json({ agreements });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    if (status >= 500) log.error("list failed", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
