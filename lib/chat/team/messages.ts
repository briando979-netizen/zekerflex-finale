import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const messageSchema = z.object({
  channelId: z.string(),
  content: z.string().min(1).max(5000),
  threadId: z.string().optional(),
  reactions: z.record(z.array(z.string())).optional(),
  pinnedAt: z.date().optional(),
});

export type MessageInput = z.infer<typeof messageSchema>;

export async function createMessage(userId: string, data: MessageInput) {
  const validated = messageSchema.parse(data);
  const message = await prisma.teamMessage.create({
    data: {
      channelId: validated.channelId,
      userId,
      content: validated.content,
      threadId: validated.threadId,
      reactions: validated.reactions || {},
    },
  });
  return message;
}

export async function getMessage(messageId: string) {
  const message = await prisma.teamMessage.findUnique({
    where: { id: messageId },
    include: { author: { select: { id: true, email: true } } },
  });
  if (!message) throw AppError.notFound("Message not found");
  return message;
}

export async function listChannelMessages(channelId: string, limit = 50, offset = 0) {
  return prisma.teamMessage.findMany({
    where: { channelId, threadId: null },
    include: { author: { select: { id: true, email: true } } },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit,
  });
}

export async function listThreadMessages(threadId: string) {
  return prisma.teamMessage.findMany({
    where: { threadId },
    include: { author: { select: { id: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function editMessage(messageId: string, userId: string, content: string) {
  const msg = await getMessage(messageId);
  if (msg.userId !== userId) throw AppError.forbidden("Cannot edit others' messages");
  return prisma.teamMessage.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
  });
}

export async function deleteMessage(messageId: string, userId: string) {
  const msg = await getMessage(messageId);
  if (msg.userId !== userId) throw AppError.forbidden("Cannot delete others' messages");
  return prisma.teamMessage.delete({ where: { id: messageId } });
}

export async function addReaction(messageId: string, userId: string, emoji: string) {
  const msg = await getMessage(messageId);
  const reactions = msg.reactions || {};
  if (!reactions[emoji]) reactions[emoji] = [];
  if (!reactions[emoji].includes(userId)) reactions[emoji].push(userId);
  return prisma.teamMessage.update({
    where: { id: messageId },
    data: { reactions },
  });
}

export async function searchMessages(channelId: string, query: string) {
  return prisma.teamMessage.findMany({
    where: { channelId, content: { contains: query, mode: "insensitive" } },
    take: 20,
  });
}

export async function pinMessage(messageId: string) {
  return prisma.teamMessage.update({
    where: { id: messageId },
    data: { pinnedAt: new Date() },
  });
}

export async function unpinMessage(messageId: string) {
  return prisma.teamMessage.update({
    where: { id: messageId },
    data: { pinnedAt: null },
  });
}
