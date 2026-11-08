import { NextRequest, NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { findBestMatches } from "@/lib/matching/score";

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

    const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
    const limit = 10;
    const offset = (page - 1) * limit;

    const shifts = await prisma.shift.findMany({
      where: {
        status: "OPEN",
        startsAt: { gte: new Date() },
        NOT: { assignments: { some: { freelancerId: freelancer.id } } },
      },
      include: { company: true },
      skip: offset,
      take: limit,
      orderBy: { startsAt: "asc" },
    });

    const withScores = await Promise.all(
      shifts.map(async (shift) => {
        const matches = await findBestMatches(shift.id, 1);
        return {
          id: shift.id,
          company: shift.company.name,
          location: shift.locatie,
          startTime: shift.startsAt,
          endTime: shift.endsAt,
          hourlyRate: shift.hourlyRate,
          matchScore: matches[0]?.score || 0,
          description: shift.description,
        };
      }),
    );

    return NextResponse.json({
      recommendations: withScores.sort((a, b) => b.matchScore - a.matchScore),
      page,
      hasMore: shifts.length === limit,
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
