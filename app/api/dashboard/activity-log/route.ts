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
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "20"), 100);

    const activities = await prisma.shiftAssignment.findMany({
      where: { freelancerId: freelancer.id },
      include: {
        shift: {
          select: {
            id: true,
            title: true,
            branch: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      activities: activities.map((a) => ({
        id: a.id,
        shiftId: a.shift.id,
        shiftTitle: a.shift.title,
        location: a.shift.branch.name,
        status: a.status,
        earnedCents: a.earningsCents,
        createdAt: a.createdAt,
        startTime: a.shift.startsAt,
      })),
      total: activities.length,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
