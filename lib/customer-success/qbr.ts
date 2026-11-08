import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import type { QBRSession } from "@prisma/client";
import { z } from "zod";

// ---------------------------------------------------------------------------
// QBR (Quarterly Business Review) Management Module
//
// Templates, agenda builders, metrics dashboards, and follow-ups for
// quarterly business reviews with customers.
// ---------------------------------------------------------------------------

export const CreateQBRSchema = z.object({
  tenantId: z.string(),
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/), // YYYY-Q1/Q2/Q3/Q4
  scheduledDate: z.date(),
  agendaItems: z.array(z.string()).default([]),
  ownerUserId: z.string().optional(),
});

export type CreateQBRInput = z.infer<typeof CreateQBRSchema>;

export const CompleteQBRSchema = z.object({
  discussionNotes: z.string().optional(),
  actionItems: z.array(z.string()).default([]),
  nextSteps: z.string().optional(),
  metricsSnapshot: z.record(z.any()).optional(),
});

export type CompleteQBRInput = z.infer<typeof CompleteQBRSchema>;

const DEFAULT_AGENDA_ITEMS = [
  "Cijfers vorig kwartaal",
  "Doelstellingen behaald",
  "Uitdagingen en blockers",
  "Expansion mogelijkheden",
  "Product roadmap",
  "Volgende actiepunten",
];

/**
 * Create a new QBR session.
 */
export async function createQBRSession(input: CreateQBRInput): Promise<QBRSession> {
  try {
    const validated = CreateQBRSchema.parse(input);

    const session = await prisma.qBRSession.create({
      data: {
        tenantId: validated.tenantId,
        quarter: validated.quarter,
        scheduledDate: validated.scheduledDate,
        agendaItems:
          validated.agendaItems.length > 0
            ? validated.agendaItems
            : DEFAULT_AGENDA_ITEMS,
        ownerUserId: validated.ownerUserId ?? null,
        status: "SCHEDULED",
      },
    });

    logger.info("QBR session created", {
      sessionId: session.id,
      tenantId: validated.tenantId,
      quarter: validated.quarter,
    });

    return session;
  } catch (err) {
    logger.error("Failed to create QBR session", {
      error: (err as Error).message,
    });
    throw AppError.validation("QBR-sessie aanmaken mislukt.");
  }
}

/**
 * Get QBR session by ID.
 */
export async function getQBRSession(id: string): Promise<QBRSession | null> {
  return prisma.qBRSession.findUnique({
    where: { id },
  });
}

/**
 * Get QBR sessions for a tenant.
 */
export async function getTenantQBRSessions(
  tenantId: string,
  limit = 20,
): Promise<QBRSession[]> {
  return prisma.qBRSession.findMany({
    where: { tenantId },
    orderBy: { scheduledDate: "desc" },
    take: limit,
  });
}

/**
 * Update QBR agenda items.
 */
export async function updateQBRAgenda(
  id: string,
  agendaItems: string[],
): Promise<QBRSession> {
  return prisma.qBRSession.update({
    where: { id },
    data: { agendaItems },
  });
}

/**
 * Reschedule a QBR session.
 */
export async function rescheduleQBR(id: string, newDate: Date): Promise<QBRSession> {
  return prisma.qBRSession.update({
    where: { id },
    data: {
      scheduledDate: newDate,
      status: "RESCHEDULED",
    },
  });
}

/**
 * Complete a QBR session with notes and action items.
 */
export async function completeQBRSession(
  id: string,
  input: CompleteQBRInput,
): Promise<QBRSession> {
  try {
    const validated = CompleteQBRSchema.parse(input);

    const session = await prisma.qBRSession.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedDate: new Date(),
        discussionNotes: validated.discussionNotes ?? null,
        actionItems: validated.actionItems,
        nextSteps: validated.nextSteps ?? null,
        metricsSnapshot: validated.metricsSnapshot ?? null,
      },
    });

    logger.info("QBR session completed", {
      sessionId: id,
      actionItemCount: validated.actionItems.length,
    });

    return session;
  } catch (err) {
    logger.error("Failed to complete QBR session", {
      sessionId: id,
      error: (err as Error).message,
    });
    throw AppError.validation("QBR-voltooiing mislukt.");
  }
}

/**
 * Cancel a QBR session.
 */
export async function cancelQBR(id: string): Promise<QBRSession> {
  return prisma.qBRSession.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
}

/**
 * Get QBRs due for scheduling (upcoming quarter).
 */
export async function getUpcomingQBRsForScheduling(): Promise<QBRSession[]> {
  const today = new Date();
  const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

  return prisma.qBRSession.findMany({
    where: {
      status: "SCHEDULED",
      scheduledDate: {
        gte: today,
        lte: in30Days,
      },
    },
    orderBy: { scheduledDate: "asc" },
  });
}

/**
 * Get QBR template with standard agenda and metrics.
 */
export function getQBRTemplate(): {
  agendaItems: string[];
  metrics: string[];
  discussion_points: string[];
} {
  return {
    agendaItems: DEFAULT_AGENDA_ITEMS,
    metrics: [
      "MRR",
      "Customer Acquisition Cost (CAC)",
      "Lifetime Value (LTV)",
      "Churn Rate",
      "Feature Adoption Rate",
      "Support Satisfaction (CSAT)",
      "Net Revenue Retention (NRR)",
    ],
    discussion_points: [
      "Gebruik van platform",
      "ROI bereikt",
      "Team feedback",
      "Pijnpunten",
      "Toekomstige doelen",
      "Training nodig",
    ],
  };
}

/**
 * Build QBR metrics dashboard for a tenant.
 */
export async function buildQBRMetricsDashboard(tenantId: string): Promise<{
  tenant_id: string;
  metrics_summary: {
    mrr: number;
    usage_score: number;
    support_sentiment: string;
    engagement_level: number;
  };
  recent_qbr: QBRSession | null;
  upcoming_qbr: QBRSession | null;
}> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) throw AppError.notFound("Tenant niet gevonden.");

  const health = await prisma.customerHealth.findUnique({
    where: { tenantId },
  });

  const recentQBR = await prisma.qBRSession.findFirst({
    where: {
      tenantId,
      status: "COMPLETED",
    },
    orderBy: { completedDate: "desc" },
    take: 1,
  });

  const upcomingQBR = await prisma.qBRSession.findFirst({
    where: {
      tenantId,
      status: "SCHEDULED",
      scheduledDate: { gte: new Date() },
    },
    orderBy: { scheduledDate: "asc" },
    take: 1,
  });

  return {
    tenant_id: tenantId,
    metrics_summary: {
      mrr: 0, // Would be fetched from billing system
      usage_score: health?.usageScore ?? 50,
      support_sentiment: "neutral",
      engagement_level: health?.engagementScore ?? 50,
    },
    recent_qbr: recentQBR,
    upcoming_qbr: upcomingQBR,
  };
}

/**
 * Generate QBR follow-up tasks from action items.
 */
export async function generateQBRFollowUpTasks(
  sessionId: string,
): Promise<{ session: QBRSession; tasks: string[] }> {
  const session = await getQBRSession(sessionId);
  if (!session || session.status !== "COMPLETED") {
    throw AppError.notFound("Voltooide QBR-sessie niet gevonden.");
  }

  const tasks = [
    ...session.actionItems,
    "Verstuur QBR-notities naar klant",
    "Plan vervolgvergadering",
    "Update klantprofiel met feedback",
  ];

  logger.info("QBR follow-up tasks generated", {
    sessionId,
    taskCount: tasks.length,
  });

  return { session, tasks };
}
