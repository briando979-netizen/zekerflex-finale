import { prisma } from "@/lib/prisma";
import { z } from "zod";

export enum TicketStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  WAITING_CUSTOMER = "WAITING_CUSTOMER",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

export enum TicketPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

export const ticketSchema = z.object({
  tenantId: z.string(),
  userId: z.string(),
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(5000),
  priority: z.nativeEnum(TicketPriority).default(TicketPriority.MEDIUM),
  tags: z.array(z.string()).default([]),
  attachmentUrls: z.array(z.string().url()).default([]),
});

export async function createTicket(
  data: z.infer<typeof ticketSchema>
) {
  const validated = ticketSchema.parse(data);

  // Auto-tag by keywords
  const tags = autoTag(validated.description, validated.tags);

  // Assign priority based on keywords
  const priority = assignPriority(validated.description, validated.priority);

  const ticket = await prisma.supportTicket.create({
    data: {
      tenantId: validated.tenantId,
      userId: validated.userId,
      title: validated.title,
      description: validated.description,
      priority,
      status: TicketStatus.OPEN,
      tags: { set: tags },
      attachmentUrls: validated.attachmentUrls,
      createdAt: new Date(),
    },
  });

  return ticket;
}

function autoTag(description: string, existingTags: string[]): string[] {
  const keywordMap: Record<string, string[]> = {
    billing: ["payment", "invoice", "charge", "refund", "subscription"],
    technical: ["bug", "error", "crash", "broken", "not working"],
    account: ["login", "password", "2fa", "mfa", "authenticate"],
    feature: ["feature request", "enhancement", "new feature"],
    performance: ["slow", "lag", "timeout", "latency"],
  };

  const tags = new Set(existingTags);
  const descLower = description.toLowerCase();

  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(kw => descLower.includes(kw))) {
      tags.add(category);
    }
  }

  return Array.from(tags);
}

function assignPriority(
  description: string,
  basePriority: TicketPriority
): TicketPriority {
  const urgentKeywords = ["urgent", "asap", "critical", "broken", "down", "outage"];
  const descLower = description.toLowerCase();

  if (urgentKeywords.some(kw => descLower.includes(kw))) {
    return TicketPriority.URGENT;
  }

  const highKeywords = ["important", "major", "significant"];
  if (highKeywords.some(kw => descLower.includes(kw))) {
    return TicketPriority.HIGH;
  }

  return basePriority;
}

export async function getTicket(tenantId: string, ticketId: string) {
  return prisma.supportTicket.findFirst({
    where: { id: ticketId, tenantId },
    include: {
      assignee: true,
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function updateTicketStatus(
  tenantId: string,
  ticketId: string,
  status: TicketStatus
) {
  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status, updatedAt: new Date() },
  });
}

export async function addInternalNote(
  ticketId: string,
  note: string,
  authorId: string
) {
  return prisma.supportMessage.create({
    data: {
      ticketId,
      authorId,
      content: note,
      isInternal: true,
    },
  });
}
