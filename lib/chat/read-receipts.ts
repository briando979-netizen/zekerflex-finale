import { prisma } from "@/lib/prisma";

export async function markAsRead(messageId: string, userId: string) {
  return await prisma.message.update({
    where: { id: messageId },
    data: { readAt: new Date(), readBy: userId },
  });
}

export async function getUnreadCount(userId: string) {
  return await prisma.message.count({
    where: { recipientId: userId, readAt: null },
  });
}

export async function getReadStatus(messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { readAt: true, readBy: true },
  });

  return {
    isRead: !!message?.readAt,
    readAt: message?.readAt,
    readBy: message?.readBy,
  };
}
