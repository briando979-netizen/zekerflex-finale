import { prisma } from "@/lib/prisma";
import { TicketPriority } from "./ticket";

export interface SlaPolicy {
  priority: TicketPriority;
  firstResponseTime: number; // minutes
  resolutionTime: number; // minutes
}

const DEFAULT_POLICIES: Record<TicketPriority, SlaPolicy> = {
  [TicketPriority.URGENT]: { priority: TicketPriority.URGENT, firstResponseTime: 15, resolutionTime: 120 },
  [TicketPriority.HIGH]: { priority: TicketPriority.HIGH, firstResponseTime: 60, resolutionTime: 480 },
  [TicketPriority.MEDIUM]: { priority: TicketPriority.MEDIUM, firstResponseTime: 240, resolutionTime: 1440 },
  [TicketPriority.LOW]: { priority: TicketPriority.LOW, firstResponseTime: 480, resolutionTime: 2880 },
};

export async function setSlaPolicy(
  tenantId: string,
  priority: TicketPriority,
  firstResponseTime: number,
  resolutionTime: number
) {
  return prisma.supportSlaPolicy.upsert({
    where: { tenantId_priority: { tenantId, priority } },
    update: { firstResponseTime, resolutionTime },
    create: { tenantId, priority, firstResponseTime, resolutionTime },
  });
}

export async function trackSla(ticketId: string) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 1 } },
  });

  if (!ticket) return null;

  const policy = DEFAULT_POLICIES[ticket.priority];
  const createdAt = ticket.createdAt.getTime();
  const now = Date.now();
  const elapsedMinutes = (now - createdAt) / 60000;

  const firstMessage = ticket.messages[0];
  const hasFirstResponse = !!firstMessage && firstMessage.authorId !== ticket.userId;
  const firstResponseMinutes = hasFirstResponse
    ? (firstMessage.createdAt.getTime() - createdAt) / 60000
    : null;

  return {
    firstResponseBreached:
      firstResponseMinutes !== null &&
      firstResponseMinutes > policy.firstResponseTime,
    resolutionBreached: elapsedMinutes > policy.resolutionTime,
    firstResponseTimeUsed: firstResponseMinutes,
    resolutionTimeUsed: elapsedMinutes,
    policy,
  };
}

export async function getSlaMetrics(tenantId: string, days: number = 30) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const tickets = await prisma.supportTicket.findMany({
    where: {
      tenantId,
      createdAt: { gte: since },
    },
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 1 },
    },
  });

  const metrics = {
    total: tickets.length,
    breached: 0,
    onTime: 0,
    avgFirstResponseTime: 0,
    avgResolutionTime: 0,
  };

  let totalFirstResponseTime = 0;
  let totalResolutionTime = 0;
  let resolvedCount = 0;

  for (const ticket of tickets) {
    const policy = DEFAULT_POLICIES[ticket.priority];
    const createdAt = ticket.createdAt.getTime();

    const firstMessage = ticket.messages[0];
    if (firstMessage) {
      const firstResponseMinutes =
        (firstMessage.createdAt.getTime() - createdAt) / 60000;
      totalFirstResponseTime += firstResponseMinutes;

      if (firstResponseMinutes > policy.firstResponseTime) {
        metrics.breached++;
      } else {
        metrics.onTime++;
      }
    }

    if (ticket.status === "CLOSED" || ticket.status === "RESOLVED") {
      const resolutionMinutes = (ticket.updatedAt.getTime() - createdAt) / 60000;
      totalResolutionTime += resolutionMinutes;
      resolvedCount++;
    }
  }

  if (tickets.filter(t => t.messages.length > 0).length > 0) {
    metrics.avgFirstResponseTime =
      totalFirstResponseTime / tickets.filter(t => t.messages.length > 0).length;
  }

  if (resolvedCount > 0) {
    metrics.avgResolutionTime = totalResolutionTime / resolvedCount;
  }

  return metrics;
}
