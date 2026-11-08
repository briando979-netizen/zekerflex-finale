import { prisma } from "@/lib/prisma";
import { ChatSession, SupportChatMessage } from "@prisma/client";
import { z } from "zod";

export const createChatSessionSchema = z.object({
  tenantId: z.string().cuid(),
  customerId: z.string().cuid().optional(),
  agentId: z.string().cuid().optional(),
});

// Create chat session
export async function createChatSession(
  data: z.infer<typeof createChatSessionSchema>
): Promise<ChatSession> {
  return prisma.chatSession.create({
    data: {
      ...data,
      status: "waiting",
    },
  });
}

// Get chat session
export async function getChatSession(
  sessionId: string,
  tenantId: string
): Promise<
  (ChatSession & {
    messages: SupportChatMessage[];
    customer: any;
    agent: any;
  }) | null
> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      customer: true,
      agent: true,
    },
  });

  if (!session || session.tenantId !== tenantId) return null;
  return session;
}

// Send message to chat
export async function sendChatMessage(
  sessionId: string,
  senderId: string,
  message: string,
  senderType: "customer" | "agent" | "bot",
  senderName: string,
  attachmentUrls?: string[]
): Promise<SupportChatMessage> {
  return prisma.supportChatMessage.create({
    data: {
      sessionId,
      senderId,
      senderType,
      senderName,
      message,
      attachmentUrls: attachmentUrls || [],
    },
  });
}

// Assign agent to chat
export async function assignAgentToChat(
  sessionId: string,
  tenantId: string,
  agentId: string
): Promise<ChatSession> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.tenantId !== tenantId) {
    throw new Error("Chat session not found");
  }

  const updated = await prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      agentId,
      agentPickedUpAt: new Date(),
      status: "active",
      queuePosition: null,
    },
  });

  // Log activity
  await prisma.chatActivity.create({
    data: {
      sessionId,
      action: "agent_assigned",
      actorId: agentId,
    },
  });

  return updated;
}

// Close chat session
export async function closeChatSession(
  sessionId: string,
  tenantId: string,
  csat?: number,
  csatComment?: string
): Promise<ChatSession> {
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
  });

  if (!session || session.tenantId !== tenantId) {
    throw new Error("Chat session not found");
  }

  const closedAt = new Date();
  const durationSeconds = session.startedAt
    ? Math.floor(
        (closedAt.getTime() - session.startedAt.getTime()) / 1000
      )
    : undefined;

  return prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      status: "closed",
      closedAt,
      durationSeconds,
      csat,
      csatComment,
    },
  });
}

// Queue chat session
export async function queueChatSession(
  tenantId: string
): Promise<{ position: number; estimatedWaitTime: number }> {
  // Count active sessions in queue
  const queuedCount = await prisma.chatSession.count({
    where: {
      tenantId,
      status: "waiting",
    },
  });

  // Estimate wait time (avg 2 minutes per chat)
  const estimatedWaitTime = (queuedCount + 1) * 2 * 60;

  return {
    position: queuedCount + 1,
    estimatedWaitTime,
  };
}

// Get available agents
export async function getAvailableAgents(
  tenantId: string
): Promise<
  Array<{
    id: string;
    name: string;
    activeSessions: number;
  }>
> {
  const agents = await prisma.user.findMany({
    where: {
      memberships: {
        some: {
          tenant: { id: tenantId },
          role: "HQ_ADMIN", // Or support role
        },
      },
    },
    include: {
      chatSessionsAsAgent: {
        where: {
          status: "active",
        },
        select: { id: true },
      },
    },
  });

  return agents.map((agent) => ({
    id: agent.id,
    name: agent.fullName,
    activeSessions: agent.chatSessionsAsAgent.length,
  }));
}

// List chat sessions
export async function listChatSessions(
  tenantId: string,
  options: {
    status?: string;
    agentId?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const { status, agentId, page = 1, pageSize = 20 } = options;

  const where: any = { tenantId };
  if (status) where.status = status;
  if (agentId) where.agentId = agentId;

  const [sessions, total] = await Promise.all([
    prisma.chatSession.findMany({
      where,
      include: {
        customer: true,
        agent: true,
        messages: { take: 1, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.chatSession.count({ where }),
  ]);

  return {
    sessions,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// Get chat metrics
export async function getChatMetrics(
  tenantId: string,
  dateRange?: { from: Date; to: Date }
) {
  const where: any = { tenantId };
  if (dateRange) {
    where.createdAt = {
      gte: dateRange.from,
      lte: dateRange.to,
    };
  }

  const sessions = await prisma.chatSession.findMany({
    where,
    select: {
      id: true,
      status: true,
      startedAt: true,
      closedAt: true,
      agentPickedUpAt: true,
      durationSeconds: true,
      csat: true,
    },
  });

  const totalSessions = sessions.length;
  const completedSessions = sessions.filter((s) => s.status === "closed").length;
  const waitingSessions = sessions.filter((s) => s.status === "waiting").length;
  const activeSessions = sessions.filter((s) => s.status === "active").length;

  const avgWaitTime = sessions
    .filter((s) => s.agentPickedUpAt)
    .reduce((acc, s) => {
      const wait =
        (s.agentPickedUpAt!.getTime() - s.startedAt.getTime()) / 1000;
      return acc + wait;
    }, 0) / Math.max(sessions.filter((s) => s.agentPickedUpAt).length, 1);

  const avgCsat =
    sessions.reduce((acc, s) => acc + (s.csat || 0), 0) /
    Math.max(sessions.filter((s) => s.csat).length, 1);

  return {
    totalSessions,
    completedSessions,
    waitingSessions,
    activeSessions,
    avgWaitTime: Math.round(avgWaitTime / 60), // Convert to minutes
    avgCsat: Math.round(avgCsat * 10) / 10,
    resolutionRate:
      totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0,
  };
}
