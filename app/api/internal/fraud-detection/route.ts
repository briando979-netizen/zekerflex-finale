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

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let flagged = 0;

    // Find workers with suspicious patterns
    const workers = await prisma.freelancerProfile.findMany({
      include: {
        assignments: {
          where: { createdAt: { gte: thirtyDaysAgo } },
          select: { status: true, cancelledAt: true },
        },
      },
    });

    for (const worker of workers) {
      const { assignments } = worker;
      let riskScore = 0;

      // High cancellation rate
      const cancelled = assignments.filter((a) => a.status === "CANCELLED").length;
      if (assignments.length > 0 && (cancelled / assignments.length) * 100 > 50) {
        riskScore += 30;
      }

      // Too many shifts, too fast (potential bot/automation)
      if (assignments.length > 50 && assignments.length < 10) {
        // weird pattern
        riskScore += 20;
      }

      // Rapid cancellations in short window
      const recentCancels = assignments
        .filter((a) => a.status === "CANCELLED" && a.cancelledAt && new Date(a.cancelledAt).getTime() > Date.now() - 24 * 60 * 60 * 1000)
        .length;
      if (recentCancels > 5) {
        riskScore += 25;
      }

      if (riskScore >= 50) {
        await prisma.freelancerProfile.update({
          where: { id: worker.id },
          data: { flaggedForReview: true },
        });
        logger.info("fraud-detection-flagged", {
          freelancerId: worker.id,
          riskScore,
        });
        flagged++;
      }
    }

    return NextResponse.json({ flagged, message: "Fraud detection scan complete" });
  } catch (err) {
    logger.error("fraud-detection-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
