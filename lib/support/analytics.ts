import { prisma } from "@/lib/prisma";
import { SupportMetric } from "@prisma/client";

// Record daily metrics
export async function recordDailyMetrics(
  tenantId: string,
  date: string
): Promise<SupportMetric> {
  // Get today's date as YYYY-MM-DD
  const today = date || new Date().toISOString().split("T")[0];

  // Check if metrics already exist for today
  let metrics = await prisma.supportMetric.findUnique({
    where: {
      tenantId_date: {
        tenantId,
        date: today,
      },
    },
  });

  if (metrics) {
    return metrics;
  }

  // Calculate metrics for the day
  const startOfDay = new Date(today + "T00:00:00Z");
  const endOfDay = new Date(today + "T23:59:59Z");

  const [ticketsCreated, ticketsResolved, ticketsClosed, urgentCount] =
    await Promise.all([
      prisma.ticket.count({
        where: {
          tenantId,
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      }),
      prisma.ticket.count({
        where: {
          tenantId,
          resolvedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      }),
      prisma.ticket.count({
        where: {
          tenantId,
          closedAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      }),
      prisma.ticket.count({
        where: {
          tenantId,
          priority: "URGENT",
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
      }),
    ]);

  // Get chat metrics
  const chatSessions = await prisma.chatSession.findMany({
    where: {
      tenantId,
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    select: {
      id: true,
      startedAt: true,
      agentPickedUpAt: true,
      closedAt: true,
      durationSeconds: true,
      csat: true,
    },
  });

  const chatSessionCount = chatSessions.length;
  const avgChatDuration =
    chatSessionCount > 0
      ? Math.round(
          chatSessions.reduce((acc, s) => acc + (s.durationSeconds || 0), 0) /
            chatSessionCount
        )
      : 0;

  const avgWaitTime =
    chatSessions.filter((s) => s.agentPickedUpAt).length > 0
      ? Math.round(
          chatSessions.reduce((acc, s) => {
            if (!s.agentPickedUpAt) return acc;
            return (
              acc +
              (s.agentPickedUpAt.getTime() - s.startedAt.getTime()) / 1000 / 60
            );
          }, 0) / chatSessions.filter((s) => s.agentPickedUpAt).length
        )
      : 0;

  const avgCsat =
    chatSessions.filter((s) => s.csat).length > 0
      ? Math.round(
          (chatSessions.reduce((acc, s) => acc + (s.csat || 0), 0) /
            chatSessions.filter((s) => s.csat).length) *
            10
        ) / 10
      : null;

  // Get assigned agent count
  const agents = await prisma.user.findMany({
    where: {
      chatSessionsAsAgent: {
        some: {
          tenantId,
        },
      },
    },
  });

  // Calculate average response time from tickets
  const resolvedTickets = await prisma.ticket.findMany({
    where: {
      tenantId,
      resolvedAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    select: {
      createdAt: true,
      firstResponseAt: true,
      resolvedAt: true,
    },
  });

  const avgResponseTime =
    resolvedTickets.filter((t) => t.firstResponseAt).length > 0
      ? Math.round(
          resolvedTickets.reduce((acc, t) => {
            if (!t.firstResponseAt) return acc;
            return acc + (t.firstResponseAt.getTime() - t.createdAt.getTime()) / 1000 / 60;
          }, 0) / resolvedTickets.filter((t) => t.firstResponseAt).length
        )
      : 0;

  const avgResolutionTime =
    resolvedTickets.length > 0
      ? Math.round(
          resolvedTickets.reduce((acc, t) => {
            if (!t.resolvedAt) return acc;
            return acc + (t.resolvedAt.getTime() - t.createdAt.getTime()) / 1000 / 60;
          }, 0) / resolvedTickets.length
        )
      : 0;

  // Count SLA breaches
  const slaBreachCount = await prisma.ticket.count({
    where: {
      tenantId,
      slaBreachCount: {
        gt: 0,
      },
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  // Count escalations
  const escalationCount = await prisma.ticket.count({
    where: {
      tenantId,
      escalationLevel: {
        gt: 0,
      },
      createdAt: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  metrics = await prisma.supportMetric.create({
    data: {
      tenantId,
      date: today,
      ticketsCreated,
      ticketsResolved,
      ticketsClosed,
      agentCount: agents.length,
      avgAgentLoad:
        agents.length > 0
          ? parseFloat(((ticketsCreated + ticketsResolved) / agents.length).toFixed(2))
          : 0,
      avgResponseTime,
      avgResolutionTime,
      avgCsat,
      chatSessionCount,
      avgChatDuration,
      avgWaitTime,
      slaBreachCount,
      escalationCount,
    },
  });

  return metrics;
}

// Get metrics for date range
export async function getMetricsRange(
  tenantId: string,
  from: Date,
  to: Date
): Promise<SupportMetric[]> {
  return prisma.supportMetric.findMany({
    where: {
      tenantId,
      date: {
        gte: from.toISOString().split("T")[0],
        lte: to.toISOString().split("T")[0],
      },
    },
    orderBy: { date: "asc" },
  });
}

// Get summary metrics
export async function getSummaryMetrics(
  tenantId: string,
  from: Date,
  to: Date
) {
  const metrics = await getMetricsRange(tenantId, from, to);

  if (metrics.length === 0) {
    return null;
  }

  const totalTicketsCreated = metrics.reduce((acc, m) => acc + m.ticketsCreated, 0);
  const totalTicketsResolved = metrics.reduce((acc, m) => acc + m.ticketsResolved, 0);
  const totalTicketsClosed = metrics.reduce((acc, m) => acc + m.ticketsClosed, 0);
  const totalChatSessions = metrics.reduce((acc, m) => acc + m.chatSessionCount, 0);
  const totalSlaBreaches = metrics.reduce((acc, m) => acc + m.slaBreachCount, 0);
  const totalEscalations = metrics.reduce((acc, m) => acc + m.escalationCount, 0);

  const avgResponseTime = Math.round(
    metrics.reduce((acc, m) => acc + (m.avgResponseTime || 0), 0) / metrics.length
  );
  const avgResolutionTime = Math.round(
    metrics.reduce((acc, m) => acc + (m.avgResolutionTime || 0), 0) / metrics.length
  );
  const avgCsat = Math.round(
    (metrics.reduce((acc, m) => acc + (m.avgCsat || 0), 0) / metrics.length) * 10
  ) / 10;
  const avgWaitTime = Math.round(
    metrics.reduce((acc, m) => acc + (m.avgWaitTime || 0), 0) / metrics.length
  );

  return {
    totalTicketsCreated,
    totalTicketsResolved,
    totalTicketsClosed,
    resolutionRate:
      totalTicketsCreated > 0
        ? Math.round((totalTicketsResolved / totalTicketsCreated) * 100)
        : 0,
    totalChatSessions,
    totalSlaBreaches,
    totalEscalations,
    avgResponseTime,
    avgResolutionTime,
    avgCsat,
    avgWaitTime,
  };
}

// Get trending metrics
export async function getTrendingMetrics(tenantId: string, days = 30) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);

  const metrics = await getMetricsRange(tenantId, from, to);

  return metrics.map((m) => ({
    date: m.date,
    ticketsCreated: m.ticketsCreated,
    ticketsResolved: m.ticketsResolved,
    avgResponseTime: m.avgResponseTime,
    avgCsat: m.avgCsat,
    chatSessions: m.chatSessionCount,
  }));
}
