import { prisma } from "@/lib/prisma";

export async function addReaction(messageId: string, userId: string, emoji: string) {
  return await prisma.messageReaction.create({
    data: { messageId, userId, emoji },
  });
}

export async function removeReaction(messageId: string, userId: string, emoji: string) {
  return await prisma.messageReaction.deleteMany({
    where: { messageId, userId, emoji },
  });
}

export async function getReactions(messageId: string) {
  const reactions = await prisma.messageReaction.groupBy({
    by: ["emoji"],
    where: { messageId },
    _count: { id: true },
  });

  return reactions.map((r) => ({ emoji: r.emoji, count: r._count.id }));
}
