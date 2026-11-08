import { prisma } from "@/lib/prisma";

export interface ChatSession {
  visitorId: string;
  tenantId: string;
  messages: Array<{ author: string; content: string; timestamp: Date }>;
  assignedAgentId?: string;
  rating?: number;
}

export async function createChatSession(
  tenantId: string,
  visitorId: string
) {
  return prisma.supportChatSession.create({
    data: {
      tenantId,
      visitorId,
      status: "ACTIVE",
      startedAt: new Date(),
    },
  });
}

export async function sendChatMessage(
  sessionId: string,
  message: string,
  isFromAgent: boolean,
  authorId: string
) {
  const chatMessage = await prisma.supportChatMessage.create({
    data: {
      sessionId,
      content: message,
      isFromAgent,
      authorId,
      timestamp: new Date(),
    },
  });

  // Assign to agent if not already assigned
  const session = await prisma.supportChatSession.findUnique({
    where: { id: sessionId },
  });

  if (!session?.assignedAgentId && isFromAgent) {
    await prisma.supportChatSession.update({
      where: { id: sessionId },
      data: { assignedAgentId: authorId },
    });
  }

  return chatMessage;
}

export async function getChatMessages(sessionId: string) {
  return prisma.supportChatMessage.findMany({
    where: { sessionId },
    orderBy: { timestamp: "asc" },
    include: { author: { select: { id: true, name: true } } },
  });
}

export async function endChatSession(sessionId: string) {
  return prisma.supportChatSession.update({
    where: { id: sessionId },
    data: {
      status: "CLOSED",
      endedAt: new Date(),
    },
  });
}

export async function rateChatSession(
  sessionId: string,
  rating: number,
  feedback?: string
) {
  return prisma.supportChatSession.update({
    where: { id: sessionId },
    data: {
      rating: Math.min(Math.max(rating, 1), 5),
      feedback,
    },
  });
}

export async function assignChatSession(
  sessionId: string,
  agentId: string
) {
  return prisma.supportChatSession.update({
    where: { id: sessionId },
    data: { assignedAgentId: agentId },
  });
}

export async function getAvailableAgents(tenantId: string) {
  const agents = await prisma.supportAgent.findMany({
    where: {
      tenantId,
      active: true,
      maxConcurrentChats: { gt: 0 },
    },
    include: {
      _count: { select: { activeChatSessions: true } },
    },
  });

  return agents
    .filter(a => a._count.activeChatSessions < a.maxConcurrentChats)
    .sort((a, b) => a._count.activeChatSessions - b._count.activeChatSessions);
}

export async function getCannedResponse(
  tenantId: string,
  responseId: string
) {
  return prisma.supportCannedResponse.findFirst({
    where: { tenantId, id: responseId },
  });
}

export async function getCannedResponses(tenantId: string) {
  return prisma.supportCannedResponse.findMany({
    where: { tenantId },
    orderBy: { title: "asc" },
  });
}

export async function createCannedResponse(
  tenantId: string,
  title: string,
  content: string,
  tags: string[] = []
) {
  return prisma.supportCannedResponse.create({
    data: {
      tenantId,
      title,
      content,
      tags: { set: tags },
    },
  });
}

export async function searchCannedResponses(
  tenantId: string,
  query: string
) {
  return prisma.supportCannedResponse.findMany({
    where: {
      tenantId,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
        { tags: { hasSome: [query] } },
      ],
    },
  });
}
