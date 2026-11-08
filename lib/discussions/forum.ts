import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { z } from "zod";

const discussionSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  channelId: z.string(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type DiscussionInput = z.infer<typeof discussionSchema>;

export async function createDiscussion(userId: string, data: DiscussionInput) {
  const validated = discussionSchema.parse(data);
  const discussion = await prisma.discussion.create({
    data: {
      title: validated.title,
      content: validated.content,
      channelId: validated.channelId,
      authorId: userId,
      category: validated.category,
      tags: validated.tags || [],
      replies: 0,
    },
  });
  return discussion;
}

export async function getDiscussion(discussionId: string) {
  const disc = await prisma.discussion.findUnique({
    where: { id: discussionId },
    include: {
      author: { select: { id: true, email: true } },
      _count: { select: { replies: true } }
    },
  });
  if (!disc) throw AppError.notFound("Discussion not found");
  return disc;
}

export async function listChannelDiscussions(channelId: string, limit = 20, offset = 0) {
  return prisma.discussion.findMany({
    where: { channelId },
    include: { author: { select: { id: true, email: true } } },
    orderBy: { createdAt: "desc" },
    skip: offset,
    take: limit,
  });
}

export async function createReply(userId: string, discussionId: string, content: string) {
  const reply = await prisma.discussionReply.create({
    data: {
      discussionId,
      authorId: userId,
      content,
    },
  });
  await prisma.discussion.update({
    where: { id: discussionId },
    data: { replies: { increment: 1 } },
  });
  return reply;
}

export async function listReplies(discussionId: string) {
  return prisma.discussionReply.findMany({
    where: { discussionId },
    include: { author: { select: { id: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export async function moderateDiscussion(discussionId: string, action: "pin" | "hide" | "lock") {
  const updates: Record<string, any> = {};
  if (action === "pin") updates.pinnedAt = new Date();
  if (action === "hide") updates.hidden = true;
  if (action === "lock") updates.locked = true;
  return prisma.discussion.update({
    where: { id: discussionId },
    data: updates,
  });
}

export async function addReactionToDiscussion(discussionId: string, userId: string, emoji: string) {
  const disc = await getDiscussion(discussionId);
  const reactions = disc.reactions || {};
  if (!reactions[emoji]) reactions[emoji] = [];
  if (!reactions[emoji].includes(userId)) reactions[emoji].push(userId);
  return prisma.discussion.update({
    where: { id: discussionId },
    data: { reactions },
  });
}

export async function searchDiscussions(channelId: string, query: string) {
  return prisma.discussion.findMany({
    where: {
      channelId,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
      ]
    },
    take: 20,
  });
}
