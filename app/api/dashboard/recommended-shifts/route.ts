import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const principal = await requirePrincipal();
    const freelancer = await prisma.freelancerProfile.findUnique({
      where: { userId: principal.userId },
      include: { preferredBranches: true },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "10"), 50);

    // Get preferred locations
    const branchIds = freelancer.preferredBranches.map((b) => b.branchId);

    // Find shifts at preferred locations
    const shifts = await prisma.shift.findMany({
      where: {
        branchId: branchIds.length > 0 ? { in: branchIds } : undefined,
        status: "PUBLISHED",
        startsAt: { gte: new Date() },
      },
      include: {
        branch: { select: { name: true } },
        assignments: { select: { freelancerId: true } },
      },
      orderBy: { startsAt: "asc" },
      take: limit,
    });

    return NextResponse.json({
      shifts: shifts.map((s) => ({
        id: s.id,
        title: s.title,
        location: s.branch.name,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        hourlyRateCents: s.hourlyRateCents,
        positions: s.positions,
        filledPositions: s.assignments.length,
      })),
      total: shifts.length,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
