import { prisma } from "@/lib/prisma";

export async function pinMessage(messageId: string, conversationId: string) {
  const existing = await prisma.pinnedMessage.findFirst({
    where: { conversationId, messageId },
  });

  if (existing) return existing;

  return await prisma.pinnedMessage.create({
    data: { messageId, conversationId },
  });
}

export async function unpinMessage(messageId: string) {
  return await prisma.pinnedMessage.deleteMany({
    where: { messageId },
  });
}

export async function getPinnedMessages(conversationId: string) {
  return await prisma.pinnedMessage.findMany({
    where: { conversationId },
    include: { message: true },
    orderBy: { createdAt: "desc" },
  });
}
