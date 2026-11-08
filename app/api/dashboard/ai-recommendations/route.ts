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
      include: {
        skills: true,
        assignments: { where: { status: "COMPLETED" }, orderBy: { completedAt: "desc" }, take: 10 },
      },
    });

    if (!freelancer) {
      throw AppError.notFound("Freelancer not found");
    }

    // Find similar shifts based on skills and history
    const recommendedShifts = await prisma.shift.findMany({
      where: {
        status: "OPEN",
        requiredSkills: {
          some: {
            id: { in: freelancer.skills.map((s) => s.id) },
          },
        },
        assignments: { none: { freelancerId: freelancer.id } },
      },
      include: { company: true, requiredSkills: true },
      take: 5,
    });

    const scoredRecommendations = recommendedShifts
      .map((shift) => {
        let score = 0;

        // Skill match
        const matchedSkills = shift.requiredSkills.filter((s) => freelancer.skills.some((fs) => fs.id === s.id)).length;
        score += (matchedSkills / shift.requiredSkills.length) * 40;

        // Pay rate alignment
        if (shift.hourlyRate && freelancer.hourlyRate) {
          const rateDiff = Math.abs(shift.hourlyRate - freelancer.hourlyRate) / freelancer.hourlyRate;
          score += Math.max(0, 30 - rateDiff * 50);
        }

        // Recent success in similar shifts
        if (freelancer.assignments.length > 0) {
          score += 30;
        }

        return {
          id: shift.id,
          company: shift.company.name,
          skills: shift.requiredSkills.map((s) => s.name),
          hourlyRate: shift.hourlyRate,
          startsAt: shift.startsAt,
          match: Math.round(Math.min(100, score)),
        };
      })
      .sort((a, b) => b.match - a.match);

    return NextResponse.json({
      recommendations: scoredRecommendations,
      reason: "Based on your skills and work history",
      nextRefresh: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
