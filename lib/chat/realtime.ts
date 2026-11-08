import { prisma } from "@/lib/prisma";
import type { ChatMessage } from "@prisma/client";

export interface RealtimeMessage {
  id: string;
  threadId: string;
  senderId: string;
  content: string;
  type: "text" | "image" | "video" | "file" | "reaction";
  reactions?: Record<string, string[]>;
  editedAt?: Date;
  deletedAt?: Date;
  status: "sending" | "sent" | "failed";
  createdAt: Date;
}

const messageCache = new Map<string, RealtimeMessage[]>();
const messageListeners = new Map<string, Set<(msg: RealtimeMessage) => void>>();

export function subscribeToThread(threadId: string, listener: (msg: RealtimeMessage) => void) {
  if (!messageListeners.has(threadId)) {
    messageListeners.set(threadId, new Set());
  }
  messageListeners.get(threadId)?.add(listener);
  return () => messageListeners.get(threadId)?.delete(listener);
}

export async function addReaction(messageId: string, emoji: string, userId: string) {
  const msg = Array.from(messageCache.values())
    .flat()
    .find((m) => m.id === messageId);

  if (!msg) return;

  if (!msg.reactions) msg.reactions = {};
  if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
  if (!msg.reactions[emoji].includes(userId)) {
    msg.reactions[emoji].push(userId);
  }

  await prisma.messageReaction.upsert({
    where: { messageId_emoji_userId: { messageId, emoji, userId } },
    create: { messageId, emoji, userId },
    update: { userId },
  });

  broadcastToThread(msg.threadId, { ...msg, type: "reaction" });
}

export async function editMessage(messageId: string, content: string) {
  const msg = Array.from(messageCache.values())
    .flat()
    .find((m) => m.id === messageId);

  if (!msg) return;

  msg.content = content;
  msg.editedAt = new Date();

  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { content, updatedAt: new Date() },
  });

  broadcastToThread(msg.threadId, msg);
}

export async function deleteMessage(messageId: string) {
  const msg = Array.from(messageCache.values())
    .flat()
    .find((m) => m.id === messageId);

  if (!msg) return;

  msg.deletedAt = new Date();

  await prisma.chatMessage.update({
    where: { id: messageId },
    data: { deletedAt: new Date() },
  });

  broadcastToThread(msg.threadId, msg);
}

export async function sendMessage(
  threadId: string,
  senderId: string,
  content: string,
  type: RealtimeMessage["type"] = "text"
): Promise<RealtimeMessage> {
  const msg: RealtimeMessage = {
    id: `msg-${Date.now()}`,
    threadId,
    senderId,
    content,
    type,
    status: "sending",
    createdAt: new Date(),
  };

  broadcastToThread(threadId, msg);

  try {
    const saved = await prisma.chatMessage.create({
      data: {
        threadId,
        senderId,
        content,
        type,
      },
    });

    msg.id = saved.id;
    msg.status = "sent";
    broadcastToThread(threadId, msg);

    return msg;
  } catch (err) {
    msg.status = "failed";
    broadcastToThread(threadId, msg);
    throw err;
  }
}

function broadcastToThread(threadId: string, message: RealtimeMessage) {
  const listeners = messageListeners.get(threadId);
  if (listeners) {
    listeners.forEach((l) => l(message));
  }
}

export async function getThreadMessages(threadId: string, limit = 50): Promise<RealtimeMessage[]> {
  const cached = messageCache.get(threadId);
  if (cached) return cached;

  const messages = await prisma.chatMessage.findMany({
    where: { threadId },
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      reactions: true,
    },
  });

  const converted = messages.map((m) => ({
    id: m.id,
    threadId: m.threadId,
    senderId: m.senderId,
    content: m.content,
    type: m.type as any,
    status: "sent" as const,
    createdAt: m.createdAt,
    reactions: m.reactions?.reduce(
      (acc: Record<string, string[]>, r: any) => {
        if (!acc[r.emoji]) acc[r.emoji] = [];
        acc[r.emoji].push(r.userId);
        return acc;
      },
      {}
    ),
  }));

  messageCache.set(threadId, converted);
  return converted;
}
