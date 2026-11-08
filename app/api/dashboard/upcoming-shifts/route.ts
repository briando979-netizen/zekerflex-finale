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
      include: { assignments: { select: { id: true } } },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const shifts = await prisma.shiftAssignment.findMany({
      where: {
        freelancerId: freelancer.id,
        status: "ACCEPTED",
        shift: {
          startsAt: { gte: now, lte: twoWeeksFromNow },
        },
      },
      include: {
        shift: {
          include: { company: true },
        },
      },
      orderBy: { shift: { startsAt: "asc" } },
      take: 10,
    });

    return NextResponse.json({
      upcoming: shifts.map((a) => ({
        id: a.id,
        company: a.shift.company.name,
        startTime: a.shift.startsAt,
        endTime: a.shift.endsAt,
        location: a.shift.locatie || "TBD",
        hourlyRate: a.shift.hourlyRate,
        durationHours: Math.round((new Date(a.shift.endsAt).getTime() - new Date(a.shift.startsAt).getTime()) / (1000 * 60 * 60)),
        status: "accepted",
      })),
      total: shifts.length,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
