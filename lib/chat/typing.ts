import { prisma } from "@/lib/prisma";

const TYPING_TIMEOUT = 3000;

export async function setTypingIndicator(userId: string, conversationId: string) {
  return await prisma.typingIndicator.upsert({
    where: { userId_conversationId: { userId, conversationId } },
    update: { updatedAt: new Date() },
    create: { userId, conversationId },
  });
}

export async function clearTypingIndicator(userId: string, conversationId: string) {
  return await prisma.typingIndicator.deleteMany({
    where: { userId, conversationId },
  });
}

export async function getTypingUsers(conversationId: string) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - TYPING_TIMEOUT);

  return await prisma.typingIndicator.findMany({
    where: { conversationId, updatedAt: { gte: cutoff } },
  });
}
