import { prisma } from "@/lib/prisma";

export interface QueueStats {
  total: number;
  byPriority: Record<string, number>;
  avgWaitTime: number;
  longestWaitTime: number;
}

export async function getQueueStats(tenantId: string): Promise<QueueStats> {
  const tickets = await prisma.supportTicket.findMany({
    where: {
      tenantId,
      status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] },
    },
  });

  const byPriority = {
    URGENT: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  let totalWaitTime = 0;
  let maxWaitTime = 0;

  for (const ticket of tickets) {
    byPriority[ticket.priority as keyof typeof byPriority]++;
    const waitTime = Date.now() - ticket.createdAt.getTime();
    totalWaitTime += waitTime;
    maxWaitTime = Math.max(maxWaitTime, waitTime);
  }

  return {
    total: tickets.length,
    byPriority,
    avgWaitTime: tickets.length > 0 ? totalWaitTime / tickets.length / 1000 : 0,
    longestWaitTime: maxWaitTime / 1000,
  };
}

export async function getAgentQueue(agentId: string) {
  return prisma.supportTicket.findMany({
    where: {
      assigneeId: agentId,
      status: { in: ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER"] },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
}

export async function reassignQueueItem(
  ticketId: string,
  fromAgentId: string,
  toAgentId: string,
  reason: string
) {
  const ticket = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { assigneeId: toAgentId },
  });

  await prisma.supportAudit.create({
    data: {
      ticketId,
      action: "REASSIGNED",
      details: `From ${fromAgentId} to ${toAgentId}: ${reason}`,
      timestamp: new Date(),
    },
  });

  return ticket;
}

export async function prioritizeTicket(
  ticketId: string,
  newPriority: string
) {
  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: { priority: newPriority },
  });
}

export async function escalateTicket(
  ticketId: string,
  escalationReason: string
) {
  const ticket = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      priority: "URGENT",
      isEscalated: true,
    },
  });

  await prisma.supportAudit.create({
    data: {
      ticketId,
      action: "ESCALATED",
      details: escalationReason,
      timestamp: new Date(),
    },
  });

  return ticket;
}

export async function reopenTicket(ticketId: string, reason: string) {
  const ticket = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status: "IN_PROGRESS",
    },
  });

  await prisma.supportAudit.create({
    data: {
      ticketId,
      action: "REOPENED",
      details: reason,
      timestamp: new Date(),
    },
  });

  return ticket;
}
