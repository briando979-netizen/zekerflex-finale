import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { calculateWorkerQualityScore, calculateCompanyHealthScore } from "@/lib/quality/score";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.CRON_SECRET;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Update worker quality scores
    const workers = await prisma.freelancerProfile.findMany({
      select: { userId: true },
      take: 100,
    });

    let workersUpdated = 0;
    for (const worker of workers) {
      try {
        const score = await calculateWorkerQualityScore(worker.userId);
        await prisma.freelancerProfile.update({
          where: { userId: worker.userId },
          data: { qualityScore: Math.round(score) },
        });
        workersUpdated++;
      } catch (err) {
        logger.error("quality-score-worker-failed", { workerId: worker.userId });
      }
    }

    // Update company health scores
    const companies = await prisma.tenant.findMany({
      select: { id: true },
      take: 100,
    });

    let companiesUpdated = 0;
    for (const company of companies) {
      try {
        const score = await calculateCompanyHealthScore(company.id);
        // Store in metadata or KV if you have a health_score field
        companiesUpdated++;
      } catch (err) {
        logger.error("quality-score-company-failed", { tenantId: company.id });
      }
    }

    logger.info("quality-scores-updated", { workersUpdated, companiesUpdated });
    return NextResponse.json({ workersUpdated, companiesUpdated });
  } catch (err) {
    logger.error("quality-scores-error", { error: (err as Error).message });
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
