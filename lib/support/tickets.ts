import { prisma } from "@/lib/prisma";
import {
  Ticket,
  TicketStatus,
  TicketPriority,
  TicketActivity,
} from "@prisma/client";
import { z } from "zod";

// Validation schemas
export const createTicketSchema = z.object({
  tenantId: z.string().cuid(),
  subject: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  customerId: z.string().cuid().optional(),
  customerEmail: z.string().email().optional(),
  category: z.enum(["billing", "technical", "general", "feature_request"]).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  tags: z.array(z.string()).optional(),
});

export const updateTicketSchema = z.object({
  subject: z.string().min(3).max(200).optional(),
  description: z.string().min(10).max(5000).optional(),
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
  assignedToId: z.string().cuid().nullable().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// Ticket creation
export async function createTicket(
  data: z.infer<typeof createTicketSchema>
): Promise<Ticket> {
  const validated = createTicketSchema.parse(data);

  // Generate ticket number
  const ticketCount = await prisma.ticket.count({
    where: { tenantId: validated.tenantId },
  });
  const ticketNumber = `TICKET-${String(ticketCount + 1).padStart(6, "0")}`;

  return prisma.ticket.create({
    data: {
      ...validated,
      ticketNumber,
      priority: validated.priority || TicketPriority.MEDIUM,
    },
  });
}

// Get ticket by ID
export async function getTicket(
  ticketId: string,
  tenantId: string
): Promise<(Ticket & {
  messages: any[];
  activities: any[];
  customer: any;
  assignedTo: any;
}) | null> {
  return prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      activities: {
        orderBy: { createdAt: "desc" },
      },
      customer: true,
      assignedTo: true,
    },
  }).then((ticket) => {
    if (!ticket || ticket.tenantId !== tenantId) return null;
    return ticket;
  });
}

// List tickets with filtering and pagination
export async function listTickets(
  tenantId: string,
  options: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assignedToId?: string;
    customerId?: string;
    category?: string;
    page?: number;
    pageSize?: number;
  } = {}
) {
  const {
    status,
    priority,
    assignedToId,
    customerId,
    category,
    page = 1,
    pageSize = 20,
  } = options;

  const where: any = { tenantId };
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (assignedToId) where.assignedToId = assignedToId;
  if (customerId) where.customerId = customerId;
  if (category) where.category = category;

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        customer: true,
        assignedTo: true,
        messages: { take: 1, orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    tickets,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

// Update ticket
export async function updateTicket(
  ticketId: string,
  tenantId: string,
  data: z.infer<typeof updateTicketSchema>,
  actorId?: string
): Promise<Ticket> {
  const validated = updateTicketSchema.parse(data);
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket || ticket.tenantId !== tenantId) {
    throw new Error("Ticket not found");
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: validated,
  });

  // Log activity
  if (actorId) {
    const changes: Record<string, { old: any; new: any }> = {};
    Object.entries(validated).forEach(([key, newValue]) => {
      const oldValue = ticket[key as keyof Ticket];
      if (oldValue !== newValue) {
        changes[key] = { old: oldValue, new: newValue };
      }
    });

    if (Object.keys(changes).length > 0) {
      await prisma.ticketActivity.create({
        data: {
          ticketId,
          action: "status_changed",
          actorId,
          metadata: changes,
        },
      });
    }
  }

  return updated;
}

// Assign ticket
export async function assignTicket(
  ticketId: string,
  tenantId: string,
  assignedToId: string | null,
  actorId: string
): Promise<Ticket> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket || ticket.tenantId !== tenantId) {
    throw new Error("Ticket not found");
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { assignedToId },
  });

  // Log activity
  await prisma.ticketActivity.create({
    data: {
      ticketId,
      action: "assigned",
      actorId,
      oldValue: ticket.assignedToId,
      newValue: assignedToId,
    },
  });

  return updated;
}

// Change ticket priority
export async function setTicketPriority(
  ticketId: string,
  tenantId: string,
  priority: TicketPriority,
  actorId: string
): Promise<Ticket> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket || ticket.tenantId !== tenantId) {
    throw new Error("Ticket not found");
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { priority },
  });

  // Log activity
  await prisma.ticketActivity.create({
    data: {
      ticketId,
      action: "priority_changed",
      actorId,
      oldValue: ticket.priority,
      newValue: priority,
    },
  });

  return updated;
}

// Resolve ticket
export async function resolveTicket(
  ticketId: string,
  tenantId: string,
  actorId: string
): Promise<Ticket> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket || ticket.tenantId !== tenantId) {
    throw new Error("Ticket not found");
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: TicketStatus.RESOLVED,
      resolvedAt: new Date(),
    },
  });

  // Log activity
  await prisma.ticketActivity.create({
    data: {
      ticketId,
      action: "status_changed",
      actorId,
      oldValue: ticket.status,
      newValue: TicketStatus.RESOLVED,
    },
  });

  return updated;
}

// Close ticket
export async function closeTicket(
  ticketId: string,
  tenantId: string,
  actorId: string
): Promise<Ticket> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket || ticket.tenantId !== tenantId) {
    throw new Error("Ticket not found");
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: TicketStatus.CLOSED,
      closedAt: new Date(),
    },
  });

  // Log activity
  await prisma.ticketActivity.create({
    data: {
      ticketId,
      action: "status_changed",
      actorId,
      oldValue: ticket.status,
      newValue: TicketStatus.CLOSED,
    },
  });

  return updated;
}

// Reopen ticket
export async function reopenTicket(
  ticketId: string,
  tenantId: string,
  actorId: string
): Promise<Ticket> {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
  });

  if (!ticket || ticket.tenantId !== tenantId) {
    throw new Error("Ticket not found");
  }

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: TicketStatus.OPEN,
      reopenCount: ticket.reopenCount + 1,
    },
  });

  // Log activity
  await prisma.ticketActivity.create({
    data: {
      ticketId,
      action: "reopened",
      actorId,
      oldValue: ticket.status,
      newValue: TicketStatus.OPEN,
    },
  });

  return updated;
}

// Get ticket metrics
export async function getTicketMetrics(
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

  const [total, open, inProgress, resolved, closed, urgent] = await Promise.all(
    [
      prisma.ticket.count({ where }),
      prisma.ticket.count({ where: { ...where, status: TicketStatus.OPEN } }),
      prisma.ticket.count({
        where: { ...where, status: TicketStatus.IN_PROGRESS },
      }),
      prisma.ticket.count({
        where: { ...where, status: TicketStatus.RESOLVED },
      }),
      prisma.ticket.count({ where: { ...where, status: TicketStatus.CLOSED } }),
      prisma.ticket.count({
        where: { ...where, priority: TicketPriority.URGENT },
      }),
    ]
  );

  return {
    total,
    open,
    inProgress,
    resolved,
    closed,
    urgent,
    resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
  };
}
