import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";

/**
 * CRM Integration — Sync leads, track interactions, deal pipeline
 * Subsystem 4 of 6 in the Sales Funnel Engine
 */

export type DealStage =
  | "opportunity"
  | "proposal"
  | "negotiation"
  | "closed_won"
  | "closed_lost";

export type InteractionType =
  | "email_open"
  | "link_click"
  | "form_fill"
  | "page_view"
  | "phone_call"
  | "meeting"
  | "note"
  | "email_sent";

export interface CreateInteractionInput {
  leadCaptureId: string;
  type: InteractionType;
  description?: string | undefined;
  url?: string | undefined;
  actorName?: string | undefined;
  actorEmail?: string | undefined;
  actorRole?: string | undefined;
  dealStage?: DealStage | undefined;
  dealValue?: number | undefined; // in cents
  duration?: number | undefined; // in seconds
  notes?: string | undefined;
}

/**
 * Record a lead interaction (email, call, meeting, note, etc).
 */
export async function recordLeadInteraction(
  input: CreateInteractionInput,
  actorId?: string,
): Promise<{ interaction: unknown }> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: input.leadCaptureId },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  const interaction = await prisma.leadInteraction.create({
    data: {
      leadCaptureId: input.leadCaptureId,
      type: input.type,
      description: input.description?.trim() ?? null,
      url: input.url?.trim() ?? null,
      actorName: input.actorName?.trim() ?? null,
      actorEmail: input.actorEmail?.trim() ?? null,
      actorRole: input.actorRole?.trim() ?? null,
      dealStage: input.dealStage ?? null,
      dealValue: input.dealValue ?? null,
      duration: input.duration ?? null,
      notes: input.notes?.trim() ?? null,
      metadata: {
        recordedAt: new Date().toISOString(),
      } as Prisma.InputJsonValue,
    },
  });

  // Update lead engagement
  await prisma.leadCapture.update({
    where: { id: input.leadCaptureId },
    data: {
      lastVisitAt: new Date(),
    },
  });

  await recordAudit({
    category: "SALES",
    action: "lead.interaction.recorded",
    actorUserId: actorId,
    summary: `Interactie vastgelegd voor ${lead.email}: ${input.type}`,
    targetType: "leadCapture",
    targetId: input.leadCaptureId,
  });

  logger.info("Lead interaction recorded", {
    leadId: input.leadCaptureId,
    type: input.type,
    dealValue: input.dealValue,
  });

  return { interaction };
}

/**
 * Create a deal for a lead.
 */
export async function createDeal(
  leadCaptureId: string,
  stage: DealStage,
  value: number,
  description: string,
): Promise<{ interaction: unknown }> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadCaptureId },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  // Record as interaction with deal data
  const interaction = await prisma.leadInteraction.create({
    data: {
      leadCaptureId,
      type: "note",
      description: `Deal aangemaakt: ${description}`,
      dealStage: stage,
      dealValue: value,
      notes: description,
      metadata: {
        dealCreatedAt: new Date().toISOString(),
        stage,
        initialValue: value,
      } as Prisma.InputJsonValue,
    },
  });

  // Update funnel stage
  const funnelStage = await prisma.funnelStage.findUnique({
    where: { leadCaptureId },
  });

  if (funnelStage) {
    const stageMap: Record<DealStage, any> = {
      opportunity: { currentStage: "CONTACT", contactAt: new Date() },
      proposal: { currentStage: "CONTACT" },
      negotiation: { currentStage: "TRIAL", trialAt: new Date() },
      closed_won: {
        currentStage: "PAID",
        paidAt: new Date(),
        actualValue: value,
      },
      closed_lost: {
        currentStage: "CHURNED",
        churnedAt: new Date(),
        lostReason: description,
      },
    };

    await prisma.funnelStage.update({
      where: { id: funnelStage.id },
      data: stageMap[stage],
    });
  }

  logger.info("Deal created", {
    leadId: leadCaptureId,
    stage,
    value,
  });

  return { interaction };
}

/**
 * Update deal stage.
 */
export async function updateDealStage(
  leadCaptureId: string,
  newStage: DealStage,
): Promise<void> {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadCaptureId },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  // Record stage change
  await prisma.leadInteraction.create({
    data: {
      leadCaptureId,
      type: "note",
      description: `Deal-fase bijgewerkt naar: ${newStage}`,
      dealStage: newStage,
    },
  });

  await recordAudit({
    category: "SALES",
    action: "deal.stage.updated",
    summary: `Deal-fase voor ${lead.email} bijgewerkt naar ${newStage}`,
    targetType: "leadCapture",
    targetId: leadCaptureId,
  });
}

/**
 * Get all interactions for a lead.
 */
export async function getLeadInteractions(
  leadCaptureId: string,
  limit: number = 50,
) {
  return prisma.leadInteraction.findMany({
    where: { leadCaptureId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/**
 * Get lead timeline (chronological interaction history).
 */
export async function getLeadTimeline(leadCaptureId: string) {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadCaptureId },
    include: {
      interactions: {
        orderBy: { createdAt: "asc" },
      },
      sequences: {
        orderBy: { createdAt: "asc" },
      },
      funnel: true,
    },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  // Combine interactions and sequences into a timeline
  const events = [
    {
      type: "lead_created",
      timestamp: lead.createdAt,
      title: "Lead vastgelegd",
      description: `Bron: ${lead.source}`,
    },
    ...(lead.interactions.map((i) => ({
      type: i.type,
      timestamp: i.createdAt,
      title: i.type.replace("_", " "),
      description: i.description,
    })) as any[]),
    ...(lead.sequences.map((s) => ({
      type: `email_${s.status}`,
      timestamp: s.sentAt || s.createdAt,
      title: `E-mail ${s.status}`,
      description: s.subject,
    })) as any[]),
  ];

  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return {
    lead,
    events,
    funnelStage: lead.funnel[0],
  };
}

/**
 * Get leads with active deals.
 */
export async function getLeadsWithActiveDeals(limit: number = 50) {
  return prisma.leadInteraction.findMany({
    where: {
      dealStage: {
        in: ["opportunity", "proposal", "negotiation"],
      },
    },
    include: {
      leadCapture: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    distinct: ["leadCaptureId"],
  });
}

/**
 * Calculate deal metrics for a lead.
 */
export async function getLeadDealMetrics(leadCaptureId: string) {
  const lead = await prisma.leadCapture.findUnique({
    where: { id: leadCaptureId },
    include: {
      interactions: true,
      funnel: true,
    },
  });

  if (!lead) {
    throw AppError.validation("Lead niet gevonden.");
  }

  const dealInteractions = lead.interactions.filter((i) => i.dealStage);
  const wonDeals = dealInteractions.filter((i) => i.dealStage === "closed_won");
  const lostDeals = dealInteractions.filter((i) => i.dealStage === "closed_lost");

  const totalDealValue = dealInteractions.reduce(
    (sum, i) => sum + (i.dealValue ?? 0),
    0,
  );
  const totalWonValue = wonDeals.reduce((sum, i) => sum + (i.dealValue ?? 0), 0);

  const winRate =
    dealInteractions.length > 0
      ? (wonDeals.length / dealInteractions.length) * 100
      : 0;

  return {
    totalDeals: dealInteractions.length,
    wonDeals: wonDeals.length,
    lostDeals: lostDeals.length,
    winRate,
    totalDealValue,
    totalWonValue,
    avgDealValue:
      dealInteractions.length > 0
        ? Math.round(totalDealValue / dealInteractions.length)
        : 0,
    avgWonValue:
      wonDeals.length > 0
        ? Math.round(totalWonValue / wonDeals.length)
        : 0,
    funnelStage: lead.funnel[0],
  };
}

/**
 * Bulk add interactions from external CRM sync.
 */
export async function bulkSyncInteractions(
  interactions: CreateInteractionInput[],
): Promise<number> {
  let synced = 0;

  for (const interaction of interactions) {
    try {
      await recordLeadInteraction(interaction);
      synced++;
    } catch (error) {
      logger.warn("Failed to sync interaction", {
        leadId: interaction.leadCaptureId,
        error,
      });
    }
  }

  logger.info("Bulk interaction sync complete", { synced, total: interactions.length });

  return synced;
}
