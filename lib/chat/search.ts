import { prisma } from "@/lib/prisma";

export async function searchMessages(query: string, userId: string, limit = 50) {
  return await prisma.message.findMany({
    where: {
      OR: [
        { content: { contains: query, mode: "insensitive" } },
        { senderId: userId },
        { recipientId: userId },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function filterMessages(userId: string, filters: any) {
  const { from, to, startDate, endDate, unread } = filters;

  return await prisma.message.findMany({
    where: {
      OR: [{ senderId: userId }, { recipientId: userId }],
      ...(from && { senderId: from }),
      ...(to && { recipientId: to }),
      ...(startDate && { createdAt: { gte: new Date(startDate) } }),
      ...(endDate && { createdAt: { lte: new Date(endDate) } }),
      ...(unread && { readAt: null }),
    },
    orderBy: { createdAt: "desc" },
  });
}
