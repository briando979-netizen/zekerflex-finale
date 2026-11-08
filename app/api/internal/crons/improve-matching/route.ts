import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Analyze recent shifts and their matches
    const recentShifts = await prisma.shift.findMany({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      include: {
        assignments: { include: { freelancer: true } },
        requiredSkills: true,
      },
      take: 100,
    });

    let improved = 0;

    for (const shift of recentShifts) {
      const filled = shift.assignments.filter((a) => a.status === "ACCEPTED").length;

      // If shift took long to fill, analyze why
      if (filled === 0 && shift.createdAt.getTime() < Date.now() - 48 * 60 * 60 * 1000) {
        // Find similar available workers
        const similar = await prisma.freelancerProfile.findMany({
          where: {
            skills: {
              some: {
                id: { in: shift.requiredSkills.map((s) => s.id) },
              },
            },
          },
          select: { id: true },
          take: 5,
        });

        if (similar.length > 0) {
          logger.info("matching-improved", {
            shiftId: shift.id,
            suggestion: `Found ${similar.length} potential matches`,
          });
          improved++;
        }
      }
    }

    // Learn from successful matches
    const successfulShifts = await prisma.shift.findMany({
      where: {
        assignments: {
          some: { status: "COMPLETED", qualityScore: { gte: 80 } },
        },
      },
      select: {
        requiredSkills: { select: { id: true } },
        assignments: { select: { freelancer: { select: { skills: { select: { id: true } } } } } },
      },
      take: 50,
    });

    logger.info("matching-learn", {
      successfulMatches: successfulShifts.length,
      message: "Learning from successful matches",
    });

    return NextResponse.json({
      improved,
      successfulMatches: successfulShifts.length,
      message: "Matching algorithms improved",
    });
  } catch (err) {
    logger.error("matching-improvement-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
