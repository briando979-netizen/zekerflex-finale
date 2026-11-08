import { prisma } from "@/lib/prisma";
import { z } from "zod";

const chatMessageSchema = z.object({
  message: z.string().min(1).max(500),
  userId: z.string(),
  streamId: z.string(),
});

const moderatorActionSchema = z.object({
  userId: z.string(),
  action: z.enum(["ban", "timeout", "mute"]),
  duration: z.number().optional(),
});

export async function sendChatMessage(data: z.infer<typeof chatMessageSchema>) {
  const validated = chatMessageSchema.parse(data);

  const isBanned = await prisma.streamModeration.findFirst({
    where: { streamId: validated.streamId, userId: validated.userId, action: "ban" },
  });

  if (isBanned) throw new Error("User is banned from this stream");

  return await prisma.streamChatMessage.create({
    data: {
      streamId: validated.streamId,
      userId: validated.userId,
      message: validated.message,
      timestamp: new Date(),
    },
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

export async function getChatHistory(streamId: string, limit = 50) {
  return await prisma.streamChatMessage.findMany({
    where: { streamId },
    orderBy: { timestamp: "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
  });
}

export async function addChatReaction(messageId: string, emoji: string, userId: string) {
  return await prisma.streamChatReaction.create({
    data: { messageId, emoji, userId },
  });
}

export async function deleteChatMessage(messageId: string) {
  return await prisma.streamChatMessage.update({
    where: { id: messageId },
    data: { deleted: true, message: "[deleted]" },
  });
}

export async function moderateUser(streamId: string, action: z.infer<typeof moderatorActionSchema>) {
  const validated = moderatorActionSchema.parse(action);

  const expiresAt = validated.duration
    ? new Date(Date.now() + validated.duration * 1000)
    : null;

  return await prisma.streamModerator.create({
    data: {
      streamId,
      userId: validated.userId,
      action: validated.action,
      expiresAt,
      createdAt: new Date(),
    },
  });
}

export async function checkSpam(message: string): Promise<boolean> {
  const spamPatterns = [/http[s]?:\/\//gi, /(\w)\1{4,}/gi];
  return spamPatterns.some((pattern) => pattern.test(message));
}

export async function getStreamModerators(streamId: string) {
  return await prisma.streamModerator.findMany({
    where: { streamId, expiresAt: { gt: new Date() } },
    include: { user: { select: { id: true, name: true } } },
  });
}
