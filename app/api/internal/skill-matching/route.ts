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

    // Find recent shifts and match with available workers
    const shifts = await prisma.shift.findMany({
      where: {
        status: "OPEN",
        assignments: { none: { status: "ACCEPTED" } },
      },
      include: {
        requiredSkills: true,
        company: true,
      },
      take: 50,
    });

    let matched = 0;

    for (const shift of shifts) {
      const workers = await prisma.freelancerProfile.findMany({
        where: {
          skills: {
            some: {
              id: { in: shift.requiredSkills.map((s) => s.id) },
            },
          },
          assignments: {
            none: {
              shift: {
                startsAt: shift.startsAt,
                endsAt: shift.endsAt,
              },
            },
          },
        },
        include: {
          skills: true,
        },
        take: 5,
      });

      for (const worker of workers) {
        // Score the match
        const skillMatches = worker.skills.filter((s) => shift.requiredSkills.some((rs) => rs.id === s.id)).length;
        const matchScore = (skillMatches / shift.requiredSkills.length) * 100;

        if (matchScore >= 70) {
          // Send recommendation notification
          logger.info("skill-match-found", {
            shiftId: shift.id,
            workerId: worker.id,
            matchScore,
          });
          matched++;
        }
      }
    }

    return NextResponse.json({ matched, message: "Skill matching complete" });
  } catch (err) {
    logger.error("skill-matching-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
