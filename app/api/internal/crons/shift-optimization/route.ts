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

    // Find unfilled shifts in next 7 days
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const unfilledShifts = await prisma.shift.findMany({
      where: {
        status: "OPEN",
        startsAt: { gte: tomorrow, lte: weekFromNow },
        assignments: { none: { status: { in: ["ACCEPTED", "IN_PROGRESS"] } } },
      },
      include: {
        company: true,
        requiredSkills: true,
      },
      take: 100,
    });

    let optimized = 0;

    for (const shift of unfilledShifts) {
      // Find best available workers
      const candidates = await prisma.freelancerProfile.findMany({
        where: {
          skills: {
            some: {
              id: { in: shift.requiredSkills.map((s) => s.id) },
            },
          },
        },
        select: {
          userId: true,
          hourlyRate: true,
          assignments: {
            where: {
              shift: {
                startsAt: { lte: new Date(shift.endsAt) },
                endsAt: { gte: new Date(shift.startsAt) },
              },
            },
            select: { id: true },
          },
        },
        take: 3,
      });

      // Filter available candidates
      const available = candidates.filter((c) => c.assignments.length === 0);

      if (available.length > 0) {
        logger.info("shift-optimized", {
          shiftId: shift.id,
          candidatesFound: available.length,
        });
        optimized++;
      }
    }

    return NextResponse.json({ optimized, message: "Shift optimization complete" });
  } catch (err) {
    logger.error("shift-optimization-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
