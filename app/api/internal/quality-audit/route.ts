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

    // Find shifts that need QA review
    const shiftsForQA = await prisma.shiftAssignment.findMany({
      where: {
        status: "COMPLETED",
        qualityScore: null,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      include: {
        freelancer: true,
        shift: true,
      },
      take: 100,
    });

    let audited = 0;
    for (const assignment of shiftsForQA) {
      try {
        // Calculate quality based on available data
        let quality = 75; // base

        // Check if shift was completed on time
        if (assignment.completedAt && assignment.shift.endsAt < assignment.completedAt) {
          quality -= 10;
        }

        // Check for disputes
        const disputes = await prisma.dispute.count({
          where: { shiftAssignmentId: assignment.id },
        });
        if (disputes > 0) quality -= 20;

        // Check worker history
        const workerQuality = await prisma.shiftAssignment.aggregate({
          where: { freelancerId: assignment.freelancerId },
          _avg: { qualityScore: true },
        });
        if (workerQuality._avg.qualityScore && workerQuality._avg.qualityScore < 70) {
          quality = Math.min(quality, workerQuality._avg.qualityScore + 5);
        }

        await prisma.shiftAssignment.update({
          where: { id: assignment.id },
          data: { qualityScore: Math.max(0, Math.min(100, quality)) },
        });

        audited++;
      } catch (err) {
        logger.error("qa-audit-failed", { assignmentId: assignment.id });
      }
    }

    logger.info("quality-audit-complete", { audited });
    return NextResponse.json({ audited, message: "Quality audit complete" });
  } catch (err) {
    logger.error("quality-audit-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
