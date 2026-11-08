import { type FunnelStageType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

/**
 * Conversion Funnel — Track progression (lead → contact → trial → paid)
 * Subsystem 5 of 6 in the Sales Funnel Engine
 */

export interface FunnelMetrics {
  totalLeads: number;
  contacts: number;
  trials: number;
  paid: number;
  retained: number;
  churned: number;
  leadToContact: number; // %
  contactToTrial: number; // %
  trialToPaid: number; // %
  avgLeadToPaidDays: number;
}

/**
 * Move a lead through the funnel stages.
 */
export async function moveThroughFunnel(
  leadCaptureId: string,
  newStage: FunnelStageType,
): Promise<void> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadCaptureId },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  // Get or create funnel stage
  let funnelStage = await prisma.funnelStage.findUnique({
    where: { leadCaptureId },
  });

  if (!funnelStage) {
    funnelStage = await prisma.funnelStage.create({
      data: {
        leadCaptureId,
        currentStage: "LEAD",
      },
    });
  }

  const previousStage = funnelStage.currentStage;

  // Update timestamps based on stage
  const updates: Record<FunnelStageType, Record<string, unknown>> = {
    LEAD: { leadAt: new Date() },
    CONTACT: { contactAt: new Date() },
    TRIAL: { trialAt: new Date() },
    PAID: { paidAt: new Date() },
    RETAINED: { retainedAt: new Date() },
    CHURNED: { churnedAt: new Date() },
  };

  // Calculate cycle times
  let leadToDealDays: number | null = null;
  let dealToPaidDays: number | null = null;

  if (newStage === "CONTACT" && funnelStage.leadAt) {
    leadToDealDays = Math.round(
      (Date.now() - funnelStage.leadAt.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  if (newStage === "PAID" && funnelStage.contactAt) {
    dealToPaidDays = Math.round(
      (Date.now() - funnelStage.contactAt.getTime()) / (1000 * 60 * 60 * 24),
    );
  }

  const updateData: Record<string, unknown> = {
    ...updates[newStage],
    currentStage: newStage,
    previousStage,
    status: newStage === "CHURNED" ? "lost" : "active",
  };

  if (leadToDealDays !== null) {
    updateData.leadToDealDays = leadToDealDays;
  }
  if (dealToPaidDays !== null) {
    updateData.dealToPaidDays = dealToPaidDays;
  }

  await prisma.funnelStage.update({
    where: { id: funnelStage.id },
    data: updateData,
  });

  await recordAudit({
    category: "SALES",
    action: "funnel.stage.moved",
    summary: `Lead ${lead.email} verplaatst van ${previousStage} naar ${newStage}`,
    targetType: "leadCapture",
    targetId: leadCaptureId,
  });

  logger.info("Lead moved through funnel", {
    leadId: leadCaptureId,
    from: previousStage,
    to: newStage,
    daysInPreviousStage: leadToDealDays,
  });
}

/**
 * Get funnel metrics for all leads.
 */
export async function getFunnelMetrics(): Promise<FunnelMetrics> {
  const stages = await prisma.funnelStage.groupBy({
    by: ["currentStage"],
    _count: {
      id: true,
    },
  });

  const stageMap = Object.fromEntries(
    stages.map((s) => [s.currentStage, s._count.id]),
  );

  const totalLeads = (stageMap.LEAD ?? 0) + Object.values(stageMap).reduce((a, b) => a + b, 0) - Object.values(stageMap).reduce((a, b) => a + b, 0) + Object.values(stageMap).reduce((a, b) => a + b, 0);
  const contacts = (stageMap.CONTACT ?? 0) + (stageMap.TRIAL ?? 0) + (stageMap.PAID ?? 0) + (stageMap.RETAINED ?? 0) + (stageMap.CHURNED ?? 0);
  const trials = (stageMap.TRIAL ?? 0) + (stageMap.PAID ?? 0) + (stageMap.RETAINED ?? 0) + (stageMap.CHURNED ?? 0);
  const paid = (stageMap.PAID ?? 0) + (stageMap.RETAINED ?? 0);
  const retained = stageMap.RETAINED ?? 0;
  const churned = stageMap.CHURNED ?? 0;

  // Get all leads
  const allLeads = await prisma.leadCapture.findMany({
    select: { id: true },
  });

  const leadToContactRate =
    allLeads.length > 0 ? Math.round((contacts / allLeads.length) * 100) : 0;
  const contactToTrialRate =
    contacts > 0 ? Math.round((trials / contacts) * 100) : 0;
  const trialToPaidRate = trials > 0 ? Math.round((paid / trials) * 100) : 0;

  // Get average cycle time
  const paidFunnels = await prisma.funnelStage.findMany({
    where: { currentStage: "PAID" },
    select: { dealToPaidDays: true },
  });

  const avgLeadToPaidDays =
    paidFunnels.length > 0
      ? Math.round(
          paidFunnels.reduce((sum, f) => sum + (f.dealToPaidDays ?? 0), 0) /
            paidFunnels.length,
        )
      : 0;

  return {
    totalLeads: allLeads.length,
    contacts,
    trials,
    paid,
    retained,
    churned,
    leadToContact: leadToContactRate,
    contactToTrial: contactToTrialRate,
    trialToPaid: trialToPaidRate,
    avgLeadToPaidDays,
  };
}

/**
 * Get detailed funnel report with cohort analysis.
 */
export async function getFunnelReport() {
  const now = new Date();
  const monthsBack = 12;

  // Get leads by month
  const cohorts: any[] = [];

  for (let i = 0; i < monthsBack; i++) {
    const monthDate = new Date(now);
    monthDate.setMonth(monthDate.getMonth() - i);
    const monthStart = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth(),
      1,
    );
    const monthEnd = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      0,
    );

    const leadsInMonth = await prisma.leadCapture.count({
      where: {
        createdAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
    });

    const funnel = await prisma.funnelStage.findMany({
      where: {
        leadCapture: {
          createdAt: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      },
      select: { currentStage: true },
    });

    const stageMap = {
      LEAD: 0,
      CONTACT: 0,
      TRIAL: 0,
      PAID: 0,
      RETAINED: 0,
      CHURNED: 0,
    };

    funnel.forEach((f) => {
      if (f.currentStage in stageMap) {
        stageMap[f.currentStage as FunnelStageType]++;
      }
    });

    cohorts.push({
      month: monthDate.toISOString().slice(0, 7),
      totalLeads: leadsInMonth,
      stages: stageMap,
      conversionRate:
        leadsInMonth > 0 ? Math.round((stageMap.PAID / leadsInMonth) * 100) : 0,
    });
  }

  return {
    monthsAnalyzed: monthsBack,
    cohorts: cohorts.reverse(),
    latestMetrics: await getFunnelMetrics(),
  };
}

/**
 * Identify bottlenecks in the funnel.
 */
export async function identifyBottlenecks(): Promise<{
  bottleneck: string | null;
  severity: "low" | "medium" | "high";
  recommendation: string;
}[]> {
  const metrics = await getFunnelMetrics();
  const issues: any[] = [];

  // Check lead-to-contact conversion
  if (metrics.leadToContact < 10) {
    issues.push({
      bottleneck: "Lead-to-Contact",
      severity: "high" as const,
      recommendation:
        "Slechts " +
        metrics.leadToContact +
        "% van de leads wordt contact. Verbeter de lead scoring of outreach.",
    });
  } else if (metrics.leadToContact < 20) {
    issues.push({
      bottleneck: "Lead-to-Contact",
      severity: "medium" as const,
      recommendation:
        "Lead-to-contact rate is " +
        metrics.leadToContact +
        "%. Dit kan beter.",
    });
  }

  // Check contact-to-trial conversion
  if (metrics.contacts > 0 && metrics.contactToTrial < 15) {
    issues.push({
      bottleneck: "Contact-to-Trial",
      severity: "high" as const,
      recommendation:
        "Slechts " +
        metrics.contactToTrial +
        "% van de contacten gaat naar trial. Demo of trial-aanbod verbeteren.",
    });
  }

  // Check trial-to-paid conversion
  if (metrics.trials > 0 && metrics.trialToPaid < 25) {
    issues.push({
      bottleneck: "Trial-to-Paid",
      severity: "medium" as const,
      recommendation:
        "Trial-to-paid rate is " +
        metrics.trialToPaid +
        "%. Onboarding of pricing-strategie aanpassen.",
    });
  }

  // Check retention
  if (
    metrics.paid > 0 &&
    metrics.retained / (metrics.paid + metrics.retained) <
      0.7
  ) {
    issues.push({
      bottleneck: "Retention",
      severity: "high" as const,
      recommendation:
        "Churn rate is hoog. Focus op customer success en retention.",
    });
  }

  return issues.length > 0
    ? issues
    : [
        {
          bottleneck: null,
          severity: "low" as const,
          recommendation: "Geen significante bottlenecks gedetecteerd.",
        },
      ];
}

/**
 * Get stalled deals (no movement in funnel for N days).
 */
export async function getStalledDeals(
  daysWithoutMovement: number = 30,
  limit: number = 50,
) {
  const cutoffDate = new Date(Date.now() - daysWithoutMovement * 24 * 60 * 60 * 1000);

  return prisma.funnelStage.findMany({
    where: {
      status: "active",
      currentStage: {
        in: ["CONTACT", "TRIAL"],
      },
      updatedAt: {
        lt: cutoffDate,
      },
    },
    include: {
      leadCapture: true,
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });
}

/**
 * Accelerate deals in a specific stage (apply discount, add resources).
 */
export async function accelerateDeal(
  leadCaptureId: string,
  action: string,
): Promise<void> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadCaptureId },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  const funnelStage = await prisma.funnelStage.findUnique({
    where: { leadCaptureId },
  });

  if (!funnelStage) {
    throw AppError.validation("Funnel stage niet gevonden.");
  }

  // Record acceleration action
  await prisma.leadInteraction.create({
    data: {
      leadCaptureId,
      type: "note",
      description: `Deal versneld: ${action}`,
      metadata: {
        accelerationAction: action,
        acceleratedAt: new Date().toISOString(),
      },
    },
  });

  await recordAudit({
    category: "SALES",
    action: "deal.accelerated",
    summary: `Deal versneld voor ${lead.email}: ${action}`,
    targetType: "leadCapture",
    targetId: leadCaptureId,
  });
}
