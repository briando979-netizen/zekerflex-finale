import { prisma } from "@/lib/prisma";
import { TicketPriority } from "./ticket";

export interface RoutingConfig {
  tenantId: string;
  skill: string;
  maxQueueSize: number;
  roundRobin: boolean;
}

export async function routeTicket(
  ticketId: string,
  priority: TicketPriority,
  tags: string[]
) {
  // Get routing config
  const configs = await prisma.supportRoutingConfig.findMany({
    where: { tags: { hasSome: tags } },
  });

  if (configs.length === 0) {
    // Default: round-robin to all available agents
    return assignToAvailableAgent(ticketId);
  }

  const config = configs[0];
  const agents = await getAvailableAgents(config.tenantId, config.skill);

  if (agents.length === 0) {
    // No agents available, add to queue
    return null;
  }

  // Assign to agent with smallest queue
  const agentId = agents.reduce((prev, curr) =>
    prev.queueSize < curr.queueSize ? prev : curr
  ).id;

  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: { assigneeId: agentId },
  });
}

async function assignToAvailableAgent(ticketId: string) {
  const agents = await prisma.user.findMany({
    where: {
      role: "SUPPORT_AGENT",
      active: true,
    },
    include: {
      _count: { select: { assignedTickets: true } },
    },
  });

  if (agents.length === 0) return null;

  const agent = agents.reduce((prev, curr) =>
    prev._count.assignedTickets < curr._count.assignedTickets ? prev : curr
  );

  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: { assigneeId: agent.id },
  });
}

async function getAvailableAgents(tenantId: string, skill: string) {
  return prisma.supportAgent.findMany({
    where: {
      tenantId,
      skills: { has: skill },
      active: true,
    },
    include: {
      _count: { select: { assignedTickets: true } },
    },
  });
}

export async function reassignTicket(
  ticketId: string,
  newAssigneeId: string,
  reason: string
) {
  const ticket = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      assigneeId: newAssigneeId,
      updatedAt: new Date(),
    },
  });

  // Log reassignment
  await prisma.supportAudit.create({
    data: {
      ticketId,
      action: "REASSIGNED",
      details: reason,
      timestamp: new Date(),
    },
  });

  return ticket;
}
