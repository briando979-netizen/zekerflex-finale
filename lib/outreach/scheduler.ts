import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface OutreachCampaign {
  name: string;
  targetWorkerIds: string[];
  message: string;
  priority: "high" | "medium" | "low";
  maxPerBatch: number;
}

export async function scheduleOutreachBatch(campaign: OutreachCampaign): Promise<{ scheduled: number; failed: number }> {
  let scheduled = 0;
  let failed = 0;

  const batchSize = campaign.maxPerBatch || 50;
  const batches = Math.ceil(campaign.targetWorkerIds.length / batchSize);

  for (let i = 0; i < batches; i++) {
    const start = i * batchSize;
    const end = Math.min(start + batchSize, campaign.targetWorkerIds.length);
    const batchWorkers = campaign.targetWorkerIds.slice(start, end);

    try {
      for (const workerId of batchWorkers) {
        const user = await prisma.user.findUnique({ where: { id: workerId } });
        if (user?.email) {
          scheduled++;
          logger.info("outreach-scheduled", {
            workerId,
            campaign: campaign.name,
            priority: campaign.priority,
          });
        }
      }
    } catch (err) {
      failed += batchWorkers.length;
      logger.error("outreach-batch-failed", {
        campaign: campaign.name,
        batch: i,
        error: (err as Error).message,
      });
    }

    // Rate limiting: wait between batches
    if (i < batches - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return { scheduled, failed };
}

export async function getActiveWorkers(
  tenantId: string,
  daysActive: number = 30
): Promise<string[]> {
  const cutoff = new Date(Date.now() - daysActive * 24 * 60 * 60 * 1000);

  const workers = await prisma.shiftAssignment.findMany({
    where: {
      shift: { branch: { tenantId } },
      createdAt: { gte: cutoff },
    },
    select: { freelancer: { select: { userId: true } } },
    distinct: ["freelancerId"],
  });

  return workers.map((w) => w.freelancer.userId);
}
